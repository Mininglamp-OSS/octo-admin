export type ChangeCategory = 'security' | 'removed' | 'fixed' | 'added' | 'changed' | 'other'

const CHANGE_CATEGORIES: readonly ChangeCategory[] = ['security', 'removed', 'fixed', 'added', 'changed', 'other']

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

/**
 * A line that announces the release itself and nothing else: it names a version,
 * optionally behind a platform, and stops.
 *
 * The card header already carries every word of it — the version, the platform
 * badges, the severity tag — so the line adds nothing, and filing it under 新增
 * additionally claims that shipping is a feature, which the per-card counters then
 * add up ("新增 2" for a release with no features at all).
 *
 * The version number is what makes it droppable. "深色模式正式发布" ends the same
 * way but names a feature, so it has no version and stays where it was.
 */
const VERSION_ANNOUNCEMENT = /\d+\.\d+(?:\.\d+)?\S*\s*(?:版本)?(?:正式|首次)?(?:发布|上线)$/

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
    } else if (VERSION_ANNOUNCEMENT.test(line)) {
      continue
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

  // Exactly "1.0.0" with nothing before it is a first stable release. parseSemVer
  // is lenient — it reads 1.0.0 out of both 1.0.0(62) and 1.0.0-rc1 — and each of
  // those says the opposite: a stream sitting on 1.0.0 while its build number
  // advances, and a release candidate. Any other version with no predecessor is
  // simply the oldest one we know about.
  if (!prevVersion) return /^v?1\.0\.0$/.test(version.trim()) ? 'initial' : 'unknown'

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
  is_force: number
  update_desc: string
}

/**
 * One card on the timeline. A desktop release carries every OS build of that
 * version, so 1.0.0 is a single entry offering both installers.
 *
 * When `builds` is present it is the authority for installers, notes and force
 * flags; the inherited scalar fields describe the newest build alone.
 */
export interface ReleaseEntry extends AppVersion {
  builds?: DesktopBuild[]
}

/**
 * A version whose suffix says it is not the final build: 2.0.0-beta, 1.0.0-rc1,
 * Octo 2.0.0-rc.2.
 *
 * Only recognised tokens count. Not every hyphen means prerelease — `1.2.3-x64` and
 * `1.2.3-20260115` are an arch and a date stamp, and ranking those below a stable
 * release would offer an older installer than the one they name.
 *
 * The triple is matched as leniently as parseSemVer does, which finds one anywhere
 * in the string: if that recognises `Octo 2.0.0` as a version, this has to recognise
 * `Octo 2.0.0-beta` as a prerelease, or the pair compares as stable-versus-nothing
 * and the beta wins.
 */
const VERSION_SUFFIX = /\d+\.\d+(?:\.\d+)?-([0-9A-Za-z]+)/
const PRERELEASE_TOKEN = /^(alpha|beta|rc|pre|preview|dev|snapshot|canary|nightly)/i

export function isPrerelease(version: string): boolean {
  const suffix = VERSION_SUFFIX.exec(version.replace(/\(.*\)/, ''))
  return suffix !== null && PRERELEASE_TOKEN.test(suffix[1])
}

/** Ranked so a stable release outranks any prerelease, and both outrank a version
 *  string we cannot read at all. */
const STABLE = 2
const PRERELEASE = 1
const UNREADABLE = 0

interface VersionRank {
  tier: number
  triple: [number, number, number]
  build: number
}

function rankVersion(version: string): VersionRank {
  const triple = parseSemVer(version)
  if (!triple) return { tier: UNREADABLE, triple: [0, 0, 0], build: 0 }
  return {
    tier: isPrerelease(version) ? PRERELEASE : STABLE,
    triple,
    build: parseBuildNumber(version) ?? 0,
  }
}

/**
 * Which of two rows for one OS the page should offer.
 *
 * A total order — tier, then version, then build, then upload time — because
 * latestDesktopDownloads() folds this over the feed, and a fold over a comparator
 * that mixes incomparable rules returns whichever answer the arrival order happens
 * to produce. The API sorts by updated_at, so that order changes whenever a row is
 * re-saved.
 *
 * Tier comes first because a prerelease is normally numbered ahead of the stable it
 * precedes — 2.0.1-beta exists before 2.0.1 does — so comparing numbers first would
 * hand out a beta for as long as it is the highest-numbered row. It is still offered
 * when nothing else is: something installable beats nothing.
 */
function supersedes(candidate: AppVersion, current: DesktopDownload): boolean {
  const a = rankVersion(candidate.app_version)
  const b = rankVersion(current.app_version)
  if (a.tier !== b.tier) return a.tier > b.tier
  for (let i = 0; i < 3; i++) {
    if (a.triple[i] !== b.triple[i]) return a.triple[i] > b.triple[i]
  }
  if (a.build !== b.build) return a.build > b.build
  return supersedesSameVersion(candidate, current)
}

/**
 * The tail of that order, for two rows already known to carry one version — which
 * is how groupReleases() meets them, having keyed the card by app_version.
 *
 * Shared rather than restated: the card links a build and the band above it offers
 * one, and if the two break a tie differently the same visitor is handed two
 * different installers for the release they are reading about.
 *
 * Rows alike down to the second still need an answer, or the fold in
 * latestDesktopDownloads() returns whichever arrived first and the
 * order-independence above is only most of a total order.
 */
function supersedesSameVersion(
  candidate: { created_at: string; download_url: string },
  current: { created_at: string; download_url: string },
): boolean {
  if (candidate.created_at !== current.created_at) return candidate.created_at > current.created_at
  return candidate.download_url > current.download_url
}

/** An installer the page can offer outright, with the version it belongs to. */
export interface DesktopDownload extends DesktopBuild {
  app_version: string
}

/**
 * The version line for the offer, or null when the installers do not share one.
 *
 * formatVersion() drops a `-suffix`, so a prerelease would be badged as the stable
 * release it is not — above a button that hands over the prerelease. Prereleases
 * therefore keep their version string verbatim. (formatVersion itself is left alone:
 * the timeline cards badge the same way, and moving them apart would be worse than
 * moving them together later.)
 */
export function offerVersionLabel(offers: DesktopDownload[]): string | null {
  // Written the same way, modulo a `v` prefix: label it.
  const raw = Array.from(new Set(offers.map((offer) => offer.app_version.trim().replace(/^v/i, ''))))
  if (raw.length === 1) return isPrerelease(raw[0]) ? raw[0] : `v${formatVersion(raw[0])}`

  // Written differently with a prerelease among them: say nothing. formatVersion()
  // drops a `-suffix`, so comparing formatted versions here would collapse Windows
  // on 1.0.0 and macOS on 1.0.0-rc1 into one version and badge the RC as stable —
  // above the button that hands it over.
  if (offers.some((offer) => isPrerelease(offer.app_version))) return null

  // All stable and formatting alike (1.0 and 1.0.0) — one version, said once.
  const formatted = Array.from(new Set(offers.map((offer) => formatVersion(offer.app_version))))
  return formatted.length === 1 ? `v${formatted[0]}` : null
}

/**
 * The newest usable installer for each desktop OS across the whole feed.
 *
 * The timeline answers "what changed"; this answers "give me the app". A desktop
 * release sinks below a week of web deploys within days, so the offer cannot be
 * tied to where its card happens to sit. Rows whose URL the browser should not be
 * handed are skipped rather than rendered as a dead button.
 */
export function latestDesktopDownloads(raw: AppVersion[]): DesktopDownload[] {
  const newestByOS = new Map<string, DesktopDownload>()

  for (const item of raw) {
    if (!desktopPlatforms.has(item.os)) continue
    if (!safeDownloadUrl(item.download_url)) continue
    const current = newestByOS.get(item.os)
    if (current && !supersedes(item, current)) continue
    newestByOS.set(item.os, {
      os: item.os,
      app_version: item.app_version,
      download_url: item.download_url,
      created_at: item.created_at,
      is_force: item.is_force,
      update_desc: item.update_desc,
    })
  }

  return desktopOrder.map((os) => newestByOS.get(os)).filter((build): build is DesktopDownload => build !== undefined)
}

/**
 * Whether every installer this card links is already on offer above it, so the card
 * can drop its own download row instead of repeating the same buttons half a screen
 * apart. Keyed by platform as well as URL: two platforms sharing one URL must not
 * cover for each other.
 */
export function offeredAbove(entry: ReleaseEntry, offers: DesktopDownload[]): boolean {
  if (!entry.builds) return false
  const offered = new Set(offers.map((offer) => `${offer.os}\u0000${offer.download_url}`))
  const links = entry.builds.filter((build) => safeDownloadUrl(build.download_url))
  return links.length > 0 && links.every((build) => offered.has(`${build.os}\u0000${build.download_url}`))
}

/** A block of release notes as one OS filed them. */
export interface NoteBlock {
  /** Platforms sharing these notes. Empty when the card has one set of notes. */
  os: string[]
  desc: string
}

/** Whether a note still says anything once release announcements are dropped. */
export function hasVisibleChanges(desc: string): boolean {
  const parsed = parseUpdateDesc(desc)
  return CHANGE_CATEGORIES.some((category) => parsed[category].length > 0)
}

/**
 * The note blocks a card should render.
 *
 * Per-OS notes are NOT merged into one document. parseUpdateDesc() is stateful —
 * a 【…】 / ## / **bold** heading owns every line after it — so unioning two OSes'
 * lines files whatever only macOS said under whatever heading Windows happened to
 * end on, which is how a macOS-only security fix earns a green 新增 badge. Builds
 * that filed identical notes still collapse into a single unlabelled block, which
 * is the common case; only genuinely differing notes are shown per OS.
 */
export function noteBlocks(entry: ReleaseEntry, viewerOS: ViewerOS | null = null): NoteBlock[] {
  if (!entry.builds) {
    return hasVisibleChanges(entry.update_desc) ? [{ os: [], desc: entry.update_desc }] : []
  }

  const blocks: NoteBlock[] = []
  const byDesc = new Map<string, NoteBlock>()
  for (const build of orderBuilds(entry.builds, viewerOS)) {
    const desc = build.update_desc.trim()
    // A note that was only ever "1.0.0 版本发布" parses to nothing; rendering it
    // would leave a platform heading standing over an empty list.
    if (!hasVisibleChanges(desc)) continue
    const shared = byDesc.get(desc)
    if (shared) {
      shared.os.push(build.os)
      continue
    }
    const block: NoteBlock = { os: [build.os], desc }
    byDesc.set(desc, block)
    blocks.push(block)
  }

  // Unlabel only when every build actually filed these notes. One block can also
  // mean the others said nothing, and presenting one platform's notes — a
  // platform-specific security fix among them — as release-wide is the same
  // misattribution this function exists to prevent.
  const spoke = blocks.reduce((count, block) => count + block.os.length, 0)
  if (blocks.length === 1 && spoke === entry.builds.length) blocks[0].os = []
  return blocks
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

const URL_SCHEME = /^([a-z][a-z0-9+.-]*):/i

/**
 * download_url is admin-entered and lands in an `href` on the public What's New
 * page, so only a plain http(s) link — or a path-relative one, which stays on this
 * origin and cannot execute script — is ever handed to the browser.
 *
 * Three things browsers do that a naive check misses:
 *   - control characters are ignored, so "java\tscript:" runs;
 *   - `\` is folded to `/` against an http(s) base, so `//host`, `\\host`, `/\host`
 *     and `\/host` are all network-path references that resolve to another origin
 *     despite carrying no scheme;
 *   - a scheme with no authority is still absolute, so `http:host` on an https page
 *     navigates to http://host rather than to a path.
 *
 * Returns the original string when it is safe to link, null when it is not.
 */
export function safeDownloadUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return null

  const probe = trimmed.replace(/[\u0000-\u0020\u007F]/g, '')
  // No relative download path starts with a backslash, and any pair of leading
  // slashes in either direction is an authority, not a path.
  if (probe.startsWith('\\') || /^[/\\][/\\]/.test(probe)) return null

  const scheme = URL_SCHEME.exec(probe)
  if (!scheme) return trimmed

  const protocol = scheme[1].toLowerCase()
  if (protocol !== 'http' && protocol !== 'https') return null
  return probe.toLowerCase().startsWith(`${protocol}://`) ? trimmed : null
}

function byNewestFirst(a: { created_at: string }, b: { created_at: string }): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}

/**
 * Collapse the raw feed into timeline cards: desktop builds group by version,
 * web deploys group by day, everything else stands alone.
 *
 * Cards come back newest first by their own timestamp, and which binary a card
 * links is decided the same way — neither depends on the order `raw` arrives in.
 */
export function groupReleases(raw: AppVersion[]): ReleaseEntry[] {
  const result: ReleaseEntry[] = []
  // Index by grouping key rather than only checking the last entry, so a release
  // landing between two web deploys no longer splits that day in two.
  const desktopByVersion = new Map<string, number>()
  const webByDate = new Map<string, number>()
  const webMembers = new Map<number, AppVersion[]>()

  for (const item of raw) {
    if (desktopPlatforms.has(item.os)) {
      const build: DesktopBuild = {
        os: item.os,
        download_url: item.download_url,
        created_at: item.created_at,
        is_force: item.is_force,
        update_desc: item.update_desc,
      }
      const at = desktopByVersion.get(item.app_version)
      if (at === undefined) {
        desktopByVersion.set(item.app_version, result.length)
        // The per-OS links live in `builds`; a single inherited URL would read as
        // authoritative for a card that offers several installers.
        result.push({ ...item, download_url: '', builds: [build] })
        continue
      }
      const entry = result[at]
      const sameOS = entry.builds!.find((existing) => existing.os === item.os)
      if (!sameOS) {
        entry.builds!.push(build)
      } else if (supersedesSameVersion(item, sameOS)) {
        // Same OS re-uploaded for this version: the card has to follow the newer
        // build, whatever order the feed happens to arrive in — and has to pick the
        // same one the band above it offers.
        Object.assign(sameOS, build)
      }
      continue
    }

    if (item.os !== 'web') {
      result.push({ ...item })
      continue
    }

    const date = item.created_at.slice(0, 10)
    const at = webByDate.get(date)
    if (at === undefined) {
      webByDate.set(date, result.length)
      webMembers.set(result.length, [item])
      result.push({ ...item })
      continue
    }
    webMembers.get(at)!.push(item)
  }

  for (const at of desktopByVersion.values()) {
    const entry = result[at]
    const newest = entry.builds!.reduce((a, b) => (b.created_at > a.created_at ? b : a))
    entry.created_at = newest.created_at
    entry.update_desc = newest.update_desc
    // 必须升级 follows the builds the card actually links, not every row that ever
    // carried this version — a superseded upload must not force its replacement.
    entry.is_force = entry.builds!.some((build) => build.is_force === 1) ? 1 : 0
  }

  for (const [at, members] of webMembers) {
    // Newest deploy first inside the day card too: arrival order is updated_at order.
    const ordered = [...members].sort(byNewestFirst)
    const entry = result[at]
    entry.created_at = ordered[0].created_at
    entry.is_force = ordered.some((member) => member.is_force === 1) ? 1 : 0
    entry.update_desc = ordered
      .map((member) => `@@TIME:${member.created_at.slice(11, 16)}@@\n${member.update_desc}`)
      .join('\n')
  }

  // Order by the date each card claims rather than by feed position: the API sorts
  // by updated_at, so re-saving an old row (fixing a typo, swapping a broken
  // installer URL) would otherwise hoist it — and the day grouped around it — into
  // the Latest Release slot. Sort is stable, so same-timestamp cards keep feed order.
  return result.sort(byNewestFirst)
}

/**
 * Best-effort sniff of the visitor's desktop OS, used only to promote the
 * matching installer. Returns null whenever we cannot be sure — mobile, ChromeOS,
 * anything unrecognised — and the page then shows every build with equal weight.
 */
/**
 * Whether the visitor is on a phone or a tablet, where a Windows or macOS installer
 * is not merely unrecognised but unusable.
 *
 * detectViewerOS() already returns null for these, but null is equally what an
 * unrecognised desktop returns — and that visitor is precisely the one who still
 * needs the installer offered. Handheld is therefore asked as its own question
 * rather than read off the absence of an answer to the other one.
 */
export function isHandheld(userAgent: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPod|iPad|Windows Phone|IEMobile/i.test(userAgent)) return true
  // iPadOS 13+ ships a desktop Safari UA claiming "Macintosh"; the touch points are
  // what still give it away.
  return /Mac OS X|Macintosh/i.test(userAgent) && maxTouchPoints > 1
}

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
