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
    } else {
      push('other', line)
    }
  }

  return result
}

export type VersionSeverity = 'major' | 'minor' | 'patch' | 'build' | 'pre-release' | 'initial'

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
  if (!cur) return 'patch'

  if (cur[0] === 0) return 'pre-release'

  const build = parseBuildNumber(version)
  if (build === 1) return 'initial'

  if (!prevVersion) return 'patch'

  const prev = parseSemVer(prevVersion)
  if (!prev) return 'patch'

  if (prev[0] === 0 && cur[0] >= 1 && cur[1] === 0 && cur[2] === 0) return 'initial'
  if (cur[0] > prev[0]) return 'major'
  if (cur[0] === prev[0] && cur[1] > prev[1]) return 'minor'
  if (cur[0] === prev[0] && cur[1] === prev[1] && cur[2] > prev[2]) return 'patch'

  const prevBuild = parseBuildNumber(prevVersion)
  if (build !== null && prevBuild !== null && build > prevBuild) return 'build'

  return 'patch'
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
