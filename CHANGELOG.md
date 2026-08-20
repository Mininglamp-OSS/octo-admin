# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial open-source release under Apache 2.0
- User, Space, Group, and App Bot management
- Backup configuration and history UI
- Changelog viewer with platform analytics
- Download and release management
- Dark mode with system-preference auto-detection
- Desktop platform lane in the changelog: Windows / macOS / Linux builds get their
  own tab, badge and version headline, grouped into one card per version that
  offers every installer
- The visitor's own OS leads the desktop download list, when it can be detected
- The desktop installers are offered above the timeline as well as on their release
  card, so the app stays reachable after its release sinks below a week of web
  deploys; on a phone, which can run neither installer, this is one line of text
  rather than a band of buttons

### Fixed
- Desktop releases were folded into the Web lane, which hid their version number
  and merged Windows and macOS builds into one card offering a single installer
- Releases with no earlier version to compare against were labelled "Patch";
  they now carry no severity tag instead of a guessed one
- A release note quoting a long identifier — a dotted config key, a file path —
  made the whole changelog page scroll sideways on a phone; notes now break inside
  a word, and the contributor row no longer sets a floor on the page width
- A line that only announced the release ("Windows 桌面端 1.0.0 版本发布") was filed
  under 新增 and counted as a feature the release did not contain. Such a line is
  now shown wherever its author filed it and counted nowhere
- A version qualifier was dropped when a version was displayed, so a card for
  1.0.0-rc1 was titled v1.0.0
- The release card and the band above it could pick different installers for the
  same version when two uploads shared a timestamp
- Re-uploading a build with the notes box empty erased the notes already on the card
- 必须升级 is set per build, but a card holding several platforms showed it
  unqualified; it now names the platforms it applies to

### Security
- Download links are resolved with the browser's own URL parser before they reach
  an `href`, and refused unless they resolve to http(s) — and, when they carry no
  scheme of their own, to this origin. Previously the shape of the string was
  matched against a list of known-bad forms, which only ever covered the forms
  someone had thought of
