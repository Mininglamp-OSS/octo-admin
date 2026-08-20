export type ChangeCategory = 'security' | 'removed' | 'fixed' | 'added' | 'changed' | 'other'

export interface ChangeItem {
  text: string
  group?: string
  /** What this line announces, when it announces a release rather than anything in
   *  it: the version, and the subject it names ahead of the version. Counted by
   *  nothing; still shown. */
  announces?: { version: string; subject: string }
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
 * The same announcement, naming the version it announces: "Windows 桌面端 1.0.0
 * 版本发布". The captured version is what lets a card tell an announcement of
 * itself from an announcement of something else that happens to have a version.
 *
 * Such a line is marked, never dropped. Filing it under 新增 claims that shipping
 * is a feature and the per-card counters then add it up ("新增 2" for a release with
 * no features at all) — but a wrong heading is a labelling bug a reader can see
 * through, while a deleted line leaves nothing to see. Marked lines are shown and
 * not counted.
 *
 * Anchored at both ends, and the run before the version may hold neither digits nor
 * punctuation, so only a line that is an announcement start to finish qualifies:
 *   - "白屏崩溃已解决，伴随 1.0.0 版本发布" reports a fix and mentions the release;
 *   - "协议从 1.0 升级到 2.0 正式上线" names two versions and is a change between them;
 *   - "1.5x 倍速播放正式上线" and "深色模式正式发布" announce features, not releases.
 * None of them are announcements of a release, and none are marked.
 *
 * Both the subject and the whole version are captured. A version number names no
 * particular thing — the plugin market can reach 2.0 in the same train that takes
 * the desktop app to 2.0.0 — so the subject is what says which thing shipped, and
 * announcesOnly() reads it before letting a card drop anything.
 *
 * Nothing at all is allowed between the version and the verb. There used to be a
 * `\S*` there to absorb a qualifier, and once the qualifier moved into the capture
 * above it had no work left — but it went on matching, and Chinese writes without
 * spaces, so "1.0.0修复白屏后正式发布" read as a bare announcement and a card threw
 * the fix away. A run of non-space characters is not decoration in a language that
 * does not separate words.
 */
const VERSION_ANNOUNCEMENT =
  /^([^\d，。；、,;:：]*?)(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z][0-9A-Za-z._+-]*)?)\s*(?:正式|首次|版本)(?:发布|上线)$/

/* Trailing sentence punctuation is common in these notes and says nothing about
   what the line is; both announcement rules anchor on the verb at the end. */
const TRAILING_STOP = /[。．.！!、，,;；]+$/

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

  const push = (cat: ChangeCategory, text: string, announces?: ChangeItem['announces']) => {
    result[cat].push(announces === undefined ? { text, group: currentGroup } : { text, group: currentGroup, announces })
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
    // Asked of the line with any 新增/修复 prefix removed and any full stop trimmed,
    // and asked before the branches below place it: an announcement is one whether
    // it was written bare, under a section heading, or behind a prefix of its own,
    // and all three shapes were inflating the counters.
    const announced = VERSION_ANNOUNCEMENT.exec((stripped || line).replace(TRAILING_STOP, ''))
    const announces = announced === null ? undefined : { version: announced[2], subject: announced[1].trim() }

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
      push(currentSection, stripped || line, announces)
    } else if (cat !== 'other') {
      push(cat, stripped, announces)
    } else if (announces) {
      // Nobody filed it anywhere, and it announces a release: 其他 is where it
      // belongs, rather than the 新增 the fallback below would give it.
      push('other', line, announces)
    } else if (RELEASE_ANNOUNCEMENT.test(line.replace(TRAILING_STOP, ''))) {
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
  if (!prevVersion) return /^v?1\.0\.0$/i.test(version.trim()) ? 'initial' : 'unknown'

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
const VERSION_SUFFIX = /\d+\.\d+(?:\.\d+)?((?:-[0-9A-Za-z._]+)+)/
/* Anchored at both ends of the token: a qualifier is the word itself, optionally
   numbered (-rc1, -beta.2). Matching on prefix alone reads -prebuilt as a
   prerelease and ranks a finished build below the release before it. */
const PRERELEASE_TOKEN = /^(alpha|beta|rc|pre|preview|dev|snapshot|canary|nightly)(\d|\.|$)/i

export function isPrerelease(version: string): boolean {
  const suffix = VERSION_SUFFIX.exec(version.replace(/\(.*\)/, ''))
  if (!suffix) return false
  // Every token, not just the first: 1.0.0-x86-rc1 names an architecture before it
  // names the release candidate it is. Split on every separator a qualifier is
  // written with — semver's own is the dot (1.0.0-x86.rc1), and an architecture is
  // as likely to be spelled x86_64 as x86.
  return suffix[1].split(/[-._]/).some((token) => token !== '' && PRERELEASE_TOKEN.test(token))
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
 *
 * It stops at the URL rather than going on to is_force and update_desc, and that is
 * enough: two rows agreeing on version, second and URL are the same installer, and
 * the notes are no longer decided here — groupReleases() picks those separately, by
 * the newest row that filed any.
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
 * Formatting alike is the first answer, and 1.0 written beside 1.0.0 is one release
 * said two ways. Where the strings differ it is the qualifier that differs, and not
 * every qualifier makes a different release: -x64 beside -arm64 is one version built
 * twice, which isPrerelease() already says in as many words, while -rc1 beside 1.0.0
 * is the release candidate and the release it precedes. So an architecture falls
 * back to the version the two builds share; a prerelease among them does not.
 *
 * A string no version can be read out of is not labelled at all: a `v` in front of
 * it would claim more than the string says.
 */
export function offerVersionLabel(offers: DesktopDownload[]): string | null {
  if (offers.length === 0) return null
  if (offers.some((offer) => parseSemVer(offer.app_version) === null)) return null

  const formatted = new Set(offers.map((offer) => formatVersion(offer.app_version.trim().replace(/^v/i, ''))))
  if (formatted.size === 1) return `v${[...formatted][0]}`

  if (offers.some((offer) => isPrerelease(offer.app_version))) return null

  const shared = new Set(offers.map((offer) => {
    const triple = parseSemVer(offer.app_version)!
    const build = parseBuildNumber(offer.app_version)
    return `${triple[0]}.${triple[1]}.${triple[2]}${build !== null ? `(${build})` : ''}`
  }))
  return shared.size === 1 ? `v${[...shared][0]}` : null
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

/**
 * The platforms a card forces an upgrade on, when that is fewer than all of them.
 *
 * One card carries every OS build of a version and is_force is per build, so a card
 * can force Windows and not macOS. Empty means the badge needs no qualifier: either
 * every build forces the upgrade, or the card carries a single build and the
 * platform badge beside it already says which one.
 */
export function forcedPlatforms(entry: ReleaseEntry): string[] {
  if (!entry.builds || entry.builds.length < 2) return []
  const forced = entry.builds.filter((build) => build.is_force === 1)
  return forced.length === entry.builds.length ? [] : forced.map((build) => build.os)
}

/* What a note may call the platform it is announcing. A card knows which platform
   each of its notes came from, and that is the half of "which release is this
   about" that a version number cannot supply. */
const PLATFORM_NAMED: Record<string, RegExp> = {
  windows: /windows|视窗/i,
  macos: /mac\b|macos|苹果/i,
  linux: /linux/i,
  web: /web|网页/i,
  android: /android|安卓/i,
  ios: /ios|iphone|苹果/i,
  chrome: /chrome/i,
  'openclaw-plugin': /openclaw/i,
}

/**
 * Whether a note says nothing the card it belongs to does not already say: every
 * line in it announces this very release, on this very platform.
 *
 * Both halves are needed. A version number names no particular thing — the plugin
 * market can reach 2.0 in the same train that takes the desktop app to 2.0.0 — so
 * matching on the number alone would read "插件市场 2.0 正式上线" as the 2.0.0 card
 * repeating itself and drop a line that is news. The subject settles it: a note is
 * about this release when it names this platform, or names nothing at all.
 *
 * Credits are not items and are not consulted here: entryContributors() reads them
 * off the entry rather than off the blocks that survive, so dropping a block cannot
 * take a credit with it and this does not have to hold a block open to protect one.
 */
export function announcesOnly(desc: string, appVersion: string, os: string): boolean {
  const items = Object.values(parseUpdateDesc(desc)).flat()
  if (items.length === 0) return false

  const own = formatVersion(appVersion.trim().replace(/^v/i, ''))
  const platform = PLATFORM_NAMED[os]
  return items.every(({ announces }) =>
    announces !== undefined
    && formatVersion(announces.version) === own
    && (announces.subject === '' || (platform !== undefined && platform.test(announces.subject))))
}

/**
 * Everyone credited anywhere in a release, read from the entry itself.
 *
 * Not from the note blocks a card ends up rendering: a block can be dropped for
 * saying nothing new, and the credits on it are not part of what it said.
 */
export function entryContributors(entry: ReleaseEntry): Contributor[] {
  const descs = entry.builds ? entry.builds.map((build) => build.update_desc) : [entry.update_desc]
  const seen = new Set<string>()
  const all: Contributor[] = []
  for (const desc of descs) {
    for (const contributor of parseContributors(desc)) {
      if (seen.has(contributor.name)) continue
      seen.add(contributor.name)
      all.push(contributor)
    }
  }
  return all
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
  const saysNothingNew = (desc: string, os: string) => !desc || announcesOnly(desc, entry.app_version, os)

  if (!entry.builds) {
    return saysNothingNew(entry.update_desc.trim(), entry.os) ? [] : [{ os: [], desc: entry.update_desc }]
  }

  const blocks: NoteBlock[] = []
  const byDesc = new Map<string, NoteBlock>()
  for (const build of orderBuilds(entry.builds, viewerOS)) {
    const desc = build.update_desc.trim()
    // A note that only announces this very release would render as a platform
    // heading over a line repeating the headline above it.
    if (saysNothingNew(desc, build.os)) continue
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

/* A base no page is ever served from, so "does this stay on our own origin" still
   has an answer where there is no document to ask — a test, a build step. */
const NO_DOCUMENT_BASE = 'https://changelog.invalid/'

function documentBase(): string {
  return typeof window === 'undefined' || !window.location ? NO_DOCUMENT_BASE : window.location.href
}

/**
 * download_url is admin-entered and lands in an `href` on the public What's New
 * page, so only a plain http(s) link — or a path-relative one, which stays on this
 * origin and cannot execute script — is ever handed to the browser.
 *
 * Where the link goes is settled by resolving it, not by reading the string: the
 * URL parser is the same one the browser will use on the href, so there is no gap
 * between the rule and the behaviour for a cleverly written string to live in.
 * Two things it decides that pattern-matching kept getting wrong:
 *   - `\` folds to `/` against an http(s) base, so `//host`, `\\host`, `/\host` and
 *     `\/host` are authorities rather than the paths they look like, and land on
 *     another origin while carrying no scheme;
 *   - a scheme need not be http(s) to parse — `javascript:` and `data:` resolve
 *     perfectly well, and only the resolved protocol says so.
 *
 * The value resolved is the value returned, not a cleaned copy of it: the parser
 * already ignores the tab, newline and carriage return that hide a scheme, so
 * "java\tscript:" resolves to javascript: and is refused on its protocol. Deciding
 * on a stripped string and handing back the original would approve one URL and
 * publish another — and a space, say, is not ignored but percent-encoded, so the two
 * are not the same link.
 *
 * The stripped copy is consulted for one question only, which is about the shape of
 * the string rather than where it goes: a scheme has to be written in full
 * (`https://host`, not `https:host`). Both reach the same place, but only one of
 * them looks like what it does.
 *
 * One deliberate relaxation over the pattern-matching this replaces: a single
 * leading backslash is now allowed. The parser folds `\evil.com` to the same-origin
 * path `/evil.com`, so refusing it was over-rejection rather than a safety property.
 *
 * Returns the original string when it is safe to link, null when it is not.
 */
export function safeDownloadUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return null

  const base = documentBase()

  let resolved: URL
  try {
    resolved = new URL(trimmed, base)
  } catch {
    return null
  }

  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null

  const probe = trimmed.replace(/[\u0000-\u0020\u007F]/g, '')
  const scheme = URL_SCHEME.exec(probe)
  if (!scheme) {
    // Carries no scheme of its own, so it may only be a path on this origin.
    return resolved.origin === new URL(base).origin ? trimmed : null
  }
  return probe.toLowerCase().startsWith(`${scheme[1].toLowerCase()}://`) ? trimmed : null
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
  // Which row the notes on each build came from, so a later row can be compared
  // against it rather than against the build the card happens to link.
  const noteSource = new Map<DesktopBuild, AppVersion>()
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
        if (build.update_desc.trim()) noteSource.set(build, item)
        continue
      }
      const entry = result[at]
      const sameOS = entry.builds!.find((existing) => existing.os === item.os)
      if (!sameOS) {
        entry.builds!.push(build)
        if (build.update_desc.trim()) noteSource.set(build, item)
        continue
      }

      // Two questions, answered separately, because one row can win the first and
      // another the second: a re-upload that only fixes a broken link is saved with
      // the notes box empty, so the build the card links and the notes it shows do
      // not have to come from the same row.
      if (supersedesSameVersion(item, sameOS)) {
        const keep = sameOS.update_desc
        Object.assign(sameOS, build, { update_desc: keep })
      }

      // Whichever row filed the newest notes owns them, whatever order the feed
      // arrived in. Folding "keep what is there if the new one is blank" instead
      // would hand the card whichever non-blank row happened to be seen first.
      const source = noteSource.get(sameOS)
      if (item.update_desc.trim() && (source === undefined || supersedesSameVersion(item, source))) {
        sameOS.update_desc = item.update_desc
        noteSource.set(sameOS, item)
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

/* Everything after the triple that a semver qualifier can carry: -rc1, -beta.2,
   -x64, +arm64. Kept rather than dropped, so a card titled v1.0.0 is never a
   1.0.0-rc1 — and, now that formatting alike is what "one release" means, so that
   two strings only collapse into one label when they really are one release. */
const VERSION_QUALIFIER = /\d+\.\d+(?:\.\d+)?([-+][0-9A-Za-z][0-9A-Za-z._+-]*)/

export function formatVersion(raw: string): string {
  const semver = parseSemVer(raw)
  if (!semver) return raw
  const build = parseBuildNumber(raw)
  const qualifier = VERSION_QUALIFIER.exec(raw.replace(/\(.*\)/, ''))
  const base = `${semver[0]}.${semver[1]}.${semver[2]}${qualifier ? qualifier[1] : ''}`
  return build !== null ? `${base}(${build})` : base
}
