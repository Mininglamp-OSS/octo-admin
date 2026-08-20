export type ChangeCategory = 'security' | 'removed' | 'fixed' | 'added' | 'changed' | 'other'

export interface ChangeItem {
  text: string
  group?: string
}

export interface ParsedChanges {
  added: ChangeItem[]
  fixed: ChangeItem[]
  changed: ChangeItem[]
  removed: ChangeItem[]
  security: ChangeItem[]
  other: ChangeItem[]
}

const SECTION_HEADING = /^【(.+?)】$/
const MD_HEADING = /^#{1,6}\s+(.+?)\s*$/
const BOLD_ONLY_LINE = /^\*\*(.+?)\*\*\s*$/
const HR_LINE = /^(?:-{3,}|\*{3,}|_{3,})$/

const ENGLISH_SECTION: Record<string, ChangeCategory> = {
  added: 'added',
  fixed: 'fixed',
  changed: 'changed',
  removed: 'removed',
  security: 'security',
  deprecated: 'removed',
}

function stripInlineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

const CATEGORY_PATTERNS: [ChangeCategory, RegExp][] = [
  ['security', /^(安全|漏洞|CVE|security)/i],
  ['removed', /^(移除|删除|废弃|下线|remove|deprecat)/i],
  ['fixed', /^(修复|修正|解决|fix[：:]?\s|bug)/i],
  ['added', /^(新增|新功能[：:]?\s?|新加|添加|支持|feat(ure)?[：:]?\s?|\+\s)/i],
  ['changed', /^(优化|改进|提升|更新|调整|升级|重构|改为|改善|chore[：:]?\s?|refactor|perf)/i],
]

/**
 * A line announcing the release itself ("Windows 桌面端 1.0.0 版本发布") names the
 * platform first, so no prefix rule catches it — it reads as 新增, not 其他.
 *
 * Deliberately NOT part of CATEGORY_PATTERNS: classifyLine() also decides section
 * headings, and a heading matching this would swallow the 修复/移除/安全 headings
 * below it into 新增. The qualifier is required so ordinary prose that merely ends
 * in 上线 ("问题：功能无法上线") stays where it belongs.
 */
const RELEASE_ANNOUNCEMENT = /(?:正式|首次|版本)(?:发布|上线)$/

const PREFIX_STRIP = /^(安全|漏洞|CVE|security|移除|删除|废弃|下线|remove|deprecat\w*|修复|修正|解决|fix|bug|新增|新功能|新加|添加|支持|feat(?:ure)?|优化|改进|提升|更新|调整|升级|重构|改为|改善|chore|refactor|perf)[：:：]?\s*/i

function stripPrefix(line: string): string {
  return line.replace(PREFIX_STRIP, '').trim()
}

function classifyLine(line: string): ChangeCategory {
  for (const [cat, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(line)) return cat
  }
  return 'other'
}

export function parseUpdateDesc(desc: string): ParsedChanges {
  const result: ParsedChanges = { added: [], fixed: [], changed: [], removed: [], security: [], other: [] }
  if (!desc) return result

  const lines = desc
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-•+]|\*(?!\*))\s+/, '').trim())
    .filter((line) => line && !CONTRIBUTORS_PATTERN.test(line) && !HR_LINE.test(line))

  let currentSection: ChangeCategory | null = null
  let currentGroup: string | undefined

  const push = (cat: ChangeCategory, text: string) => {
    result[cat].push({ text, group: currentGroup })
  }

  for (const raw of lines) {
    const sectionMatch = SECTION_HEADING.exec(raw)
    if (sectionMatch) {
      currentSection = classifyLine(sectionMatch[1])
      currentGroup = undefined
      continue
    }

    const mdHeadingMatch = MD_HEADING.exec(raw)
    if (mdHeadingMatch) {
      const heading = stripInlineMarkdown(mdHeadingMatch[1])
      const cat = classifyLine(heading)
      currentSection = cat !== 'other' ? cat : null
      currentGroup = undefined
      continue
    }

    const boldOnlyMatch = BOLD_ONLY_LINE.exec(raw)
    if (boldOnlyMatch) {
      const heading = boldOnlyMatch[1].trim()
      const cat = classifyLine(heading)
      if (cat !== 'other') {
        currentSection = cat
        currentGroup = undefined
      } else {
        // subsection label like **消息与会话** — keep as group within current section
        currentGroup = heading
      }
      continue
    }

    const englishSection = ENGLISH_SECTION[raw.toLowerCase()]
    if (englishSection) {
      currentSection = englishSection
      currentGroup = undefined
      continue
    }

    const line = stripInlineMarkdown(raw)
    if (!line) continue

    const isHeader = /^.+[：:]\s*$/.test(line)
    const cat = classifyLine(line)
    const stripped = stripPrefix(line)

    // bare keyword line like "新增" / "修复" — section header, not item
    if (cat !== 'other' && !stripped) {
      currentSection = cat
      currentGroup = undefined
      continue
    }

    if (isHeader && cat !== 'other') {
      currentSection = cat
      currentGroup = undefined
    } else if (currentSection) {
      // explicit section in effect — respect it, ignore per-line prefix classification
      push(currentSection, stripped || line)
    } else if (cat !== 'other') {
      push(cat, stripped)
    } else if (RELEASE_ANNOUNCEMENT.test(line)) {
      push('added', line)
    } else {
      push('other', line)
    }
  }

  return result
}

export type VersionSeverity = 'major' | 'minor' | 'patch' | 'build' | 'pre-release' | 'initial' | 'unknown'

function parseSemVer(version: string): [number, number, number] | null {
  const cleaned = version.replace(/\(.*\)/, '')
  const match = cleaned.match(/v?(\d+)\.(\d+)\.?(\d*)/)
  if (!match) return null
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3] || '0')]
}

function parseBuildNumber(version: string): number | null {
  const match = version.match(/\((\d+)\)/)
  return match ? parseInt(match[1]) : null
}

export function getVersionSeverity(version: string, prevVersion?: string): VersionSeverity {
  const cur = parseSemVer(version)
  // 'unknown' means "nothing to compare against" and renders no tag at all —
  // better than guessing 'patch' for the oldest entry we happen to hold.
  if (!cur) return 'unknown'

  if (cur[0] === 0) return 'pre-release'

  const build = parseBuildNumber(version)
  if (build === 1) return 'initial'

  // 1.0.0 with nothing before it is a first stable release; any other version
  // with no predecessor is simply the oldest one we know about.
  if (!prevVersion) return cur[0] === 1 && cur[1] === 0 && cur[2] === 0 ? 'initial' : 'unknown'

  const prev = parseSemVer(prevVersion)
  if (!prev) return 'unknown'

  if (prev[0] === 0 && cur[0] >= 1 && cur[1] === 0 && cur[2] === 0) return 'initial'
  if (cur[0] > prev[0]) return 'major'
  if (cur[0] === prev[0] && cur[1] > prev[1]) return 'minor'
  if (cur[0] === prev[0] && cur[1] === prev[1] && cur[2] > prev[2]) return 'patch'

  const prevBuild = parseBuildNumber(prevVersion)
  if (build !== null && prevBuild !== null && build > prevBuild) return 'build'

  // Nothing increased — a staggered rollout can put 1.0.0 after 1.1.0 in the shared
  // desktop lane. No tag beats a wrong one.
  return 'unknown'
}

export interface AppVersion {
  app_version: string
  os: string
  is_force: number
  update_desc: string
  download_url: string
  created_at: string
}

export interface DesktopBuild {
  os: string
  download_url: string
  created_at: string
}

/** One card on the timeline. A desktop release carries every OS build of that
 *  version, so 1.0.0 is a single entry offering both installers. */
export interface ReleaseEntry extends AppVersion {
  builds?: DesktopBuild[]
}

/* Desktop builds are versioned, downloadable artifacts. All builds of one version
   share a card — 1.0.0 is a single release that happens to ship two installers —
   while `web` collapses per day, since it ships several times a day with nothing
   to download.

   This list is the single source of truth: the platform set, the fallback display
   order and the ViewerOS union all derive from it. */
export const desktopOrder = ['windows', 'macos', 'linux'] as const

export type ViewerOS = (typeof desktopOrder)[number]

export const desktopPlatforms: ReadonlySet<string> = new Set(desktopOrder)

/** The visitor's own build first; everything else in the canonical order. */
export function orderBuilds(builds: DesktopBuild[], viewerOS: ViewerOS | null): DesktopBuild[] {
  const rank = (os: string) => {
    const at = (desktopOrder as readonly string[]).indexOf(os)
    return at === -1 ? desktopOrder.length : at
  }
  return [...builds].sort((a, b) => {
    if (a.os === b.os) return 0
    if (a.os === viewerOS) return -1
    if (b.os === viewerOS) return 1
    return rank(a.os) - rank(b.os)
  })
}

/** Per-OS notes usually repeat verbatim; union them line by line so a shared line
 *  is not duplicated and an OS-specific line is never swallowed. */
function mergeNotes(existing: string, incoming: string): string {
  const seen = new Set(existing.split('\n').map((line) => line.trim()))
  const extra = incoming
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !seen.has(line))
  return extra.length > 0 ? existing + '\n' + extra.join('\n') : existing
}

/**
 * Collapse the raw feed into timeline cards: desktop builds group by version,
 * web deploys group by day, everything else stands alone.
 *
 * Card order follows `raw`, which the API returns newest first; which binary a
 * card links is decided by comparing timestamps, not by that order.
 */
export function groupReleases(raw: AppVersion[]): ReleaseEntry[] {
  const result: ReleaseEntry[] = []
  // Index by grouping key rather than only checking the last entry, so a release
  // landing between two web deploys no longer splits that day in two.
  const desktopByVersion = new Map<string, number>()
  const webByDate = new Map<string, number>()

  for (const item of raw) {
    if (desktopPlatforms.has(item.os)) {
      const build = { os: item.os, download_url: item.download_url, created_at: item.created_at }
      const at = desktopByVersion.get(item.app_version)
      if (at === undefined) {
        desktopByVersion.set(item.app_version, result.length)
        result.push({ ...item, builds: [build] })
        continue
      }
      const entry = result[at]
      const sameOS = entry.builds!.find((existing) => existing.os === item.os)
      if (!sameOS) {
        entry.builds!.push(build)
      } else if (item.created_at > sameOS.created_at) {
        // Same OS re-uploaded for this version: the link has to point at the newer
        // binary, whatever order the feed happens to arrive in.
        sameOS.download_url = item.download_url
        sameOS.created_at = item.created_at
      }
      entry.created_at = entry.created_at > item.created_at ? entry.created_at : item.created_at
      entry.is_force = entry.is_force || item.is_force
      entry.update_desc = mergeNotes(entry.update_desc, item.update_desc)
      continue
    }

    if (item.os !== 'web') {
      result.push({ ...item })
      continue
    }

    const date = item.created_at.slice(0, 10)
    const taggedDesc = `@@TIME:${item.created_at.slice(11, 16)}@@\n${item.update_desc}`
    const at = webByDate.get(date)
    if (at === undefined) {
      webByDate.set(date, result.length)
      result.push({ ...item, update_desc: taggedDesc })
      continue
    }
    const entry = result[at]
    entry.created_at = entry.created_at > item.created_at ? entry.created_at : item.created_at
    entry.update_desc = entry.update_desc + '\n' + taggedDesc
    entry.is_force = entry.is_force || item.is_force
  }

  return result
}

/**
 * Best-effort sniff of the visitor's desktop OS, used only to promote the
 * matching installer. Returns null whenever we cannot be sure — mobile, ChromeOS,
 * anything unrecognised — and the page then shows every build with equal weight.
 */
export function detectViewerOS(userAgent: string, maxTouchPoints = 0): ViewerOS | null {
  if (/Android/i.test(userAgent)) return null
  if (/iPhone|iPod/i.test(userAgent)) return null
  if (/CrOS/i.test(userAgent)) return null
  if (/Windows NT/i.test(userAgent)) return 'windows'
  // iPadOS 13+ ships a desktop Safari UA claiming "Macintosh"; the touch points
  // are what still give it away.
  if (/iPad/i.test(userAgent)) return null
  if (/Mac OS X|Macintosh/i.test(userAgent)) return maxTouchPoints > 1 ? null : 'macos'
  if (/Linux|X11/i.test(userAgent)) return 'linux'
  return null
}

export interface Contributor {
  name: string
  avatar: string
  fallbackAvatar: string
}

const CONTRIBUTORS_PATTERN = /^@contributors:\s*(.+)/i
const GITHUB_AVATAR_SIZE = 48
const CONTRIBUTOR_COLORS = ['b6e3f4', 'ffdfbf', 'c0aede', 'd1f4e0', 'ffd5dc', 'ffe4c4', 'c4e0ff', 'f4d1e0']

function githubAvatarUrl(name: string): string {
  const login = name.replace(/^@+/, '')
  return `https://github.com/${encodeURIComponent(login)}.png?size=${GITHUB_AVATAR_SIZE}`
}

function fallbackAvatarUrl(name: string, index: number): string {
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(name)}&backgroundColor=${CONTRIBUTOR_COLORS[index % CONTRIBUTOR_COLORS.length]}`
}

export function parseContributors(desc: string): Contributor[] {
  if (!desc) return []

  const lines = desc.split('\n').map((l) => l.trim())
  for (const line of lines) {
    const match = CONTRIBUTORS_PATTERN.exec(line)
    if (match) {
      return match[1]
        .split(/[,，、]\s*/)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name, index) => ({
          name,
          avatar: githubAvatarUrl(name),
          fallbackAvatar: fallbackAvatarUrl(name, index),
        }))
    }
  }
  return []
}

export function formatVersion(raw: string): string {
  const semver = parseSemVer(raw)
  if (!semver) return raw
  const build = parseBuildNumber(raw)
  const base = `${semver[0]}.${semver[1]}.${semver[2]}`
  return build !== null ? `${base}(${build})` : base
}
