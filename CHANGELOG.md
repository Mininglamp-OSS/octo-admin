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

### Fixed
- Desktop releases were folded into the Web lane, which hid their version number
  and merged Windows and macOS builds into one card offering a single installer
- Releases with no earlier version to compare against were labelled "Patch";
  they now carry no severity tag instead of a guessed one
