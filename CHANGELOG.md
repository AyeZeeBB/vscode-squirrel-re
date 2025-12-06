# Changelog

All notable changes to the Squirrel (Respawn) extension will be documented in this file.

## [2.1.0] - 2025-12-06

### Added - KeyValues/UI Support

#### New Language: Respawn KeyValues
Complete support for Valve KeyValue (VDF) format files used in Respawn games:

**File Types:**
- `.res` - UI panel/resource files
- `.menu` - Menu definition files  
- `.txt` in `weapons/` folder - Weapon configuration
- `.txt` in `aisettings/` folder - AI settings
- `.txt` in `turrets/` folder - Turret configuration
- `.txt` in `damage/` folder - Damage definitions

**Syntax Highlighting:**
- `#base` include directives
- Key-value pairs (quoted and unquoted)
- Nested blocks (`WeaponData`, `Mods`, control definitions)
- Platform conditionals (`[$PC]`, `[$GAMECONSOLE]`, etc.)
- Color values (`255 255 255 128`)
- Percentage values (`%100`)
- Format values (`f0`)
- Damage flags (`DF_BULLET | DF_KNOCK_BACK`)
- Localization strings (`#MENU_TEXT`)
- Asset paths (`.rpak`, `.rui`, `.res`, `.menu`, `.rmdl`)

**Snippets (30+ new):**
- `WeaponData` - Full weapon configuration block
- `Mods`, `mod` - Mod definitions
- `damage_flags` - Damage flag combinations
- `control` - Generic UI control
- `ruibutton` - RUI button definition
- `ruipanel` - RUI panel definition
- `label` - Label control
- `nestedpanel` - Nested panel with file reference
- `pin` - Pin to sibling positioning
- `ruiargs` - RUI arguments block
- `nav` - Navigation properties
- `menuroot` - Menu file template
- `screen` - Screen background control
- `inherit` - Inherit properties
- Platform conditionals, colors, fonts

#### Language Configuration
- Bracket matching for `{ }`
- Auto-closing pairs for quotes and braces
- Proper code folding
- Indentation rules

---

## [2.0.0] - 2025-12-06

### Major Upgrade - Squirrel Support

Complete rewrite of the extension with comprehensive Respawn Squirrel support.

### Added

#### Syntax Highlighting
- **Typed function declarations**: `void function`, `int function`, `bool function`, `string function`, `float function`, `entity function`, `vector function`, `array<T> function`, etc.
- **Generic types**: Full support for `array<T>` and `table<K, V>` with proper type parameter highlighting
- **Struct definitions**: Both named and anonymous structs with member highlighting
- **Struct members**: Typed members with reference operator (`&`) support
- **Typedef support**: `global typedef` declarations
- **Preprocessor directives**: 
  - Conditionals: `#if`, `#elseif`, `#elif`, `#else`, `#endif`
  - Documentation: `#document`
  - Imports: `#include`, `#require`
- **Platform constants**: `SERVER`, `CLIENT`, `UI`, `SP`, `MP`, `DEV`, `DEVELOPER`, `CONSOLE_PROG`, `DURANGO_PROG`, `PS4_PROG`, `PC_PROG`, `LOBBY`, `MP_PVEMODE`
- **Vector literals**: `<x, y, z>` syntax with proper numeric highlighting
- **Asset literals**: `$"path/to/file"` syntax
- **Threading keywords**: `thread`, `wait`, `waitthread`, `waitthreadsolo`
- **Special modifiers**: `ornull`, `untyped`, `globalize_all_functions`, `unreachable`
- **Function references**: `functionref` type with parameter signatures
- **Built-in function highlighting**: Signal functions, precache functions, assertion functions, validation functions

#### RSON Language Support
- New language support for `.rson` files (Respawn JSON format)
- Syntax highlighting for RSON-specific constructs
- `When:`, `Scripts:` keyword highlighting
- Platform constant support in RSON

#### Snippets (60+ new snippets)
- **Function declarations**: `vf`, `bf`, `if`, `sf`, `ff`, `ef`, `vecf`, `af`
- **Control structures**: `for`, `foreach`, `foreachk`, `while`, `switch`, `try`
- **Data structures**: `struct`, `gstruct`, `filestruct`, `enum`, `genum`, `class`
- **Variables**: `local`, `arr`, `tbl`, `gconst`
- **Threading**: `thread`, `wait`, `waitframe`, `waitthread`
- **Signals**: `regsig`, `endsig`, `waitsig`, `Signal`, `OnThreadEnd`
- **Preprocessor**: `#server`, `#client`, `#ui`, `#sc`, `#all`, `#dev`, `#document`
- **Common patterns**: `init`, `shinit`, `isvalid`, `isplayer`, `assert`, `lambda`
- **Player functions**: `getplayers`, `foreachplayer`, `localplayer`
- **File templates**: `template_shared`, `template_server`, `template_client`
- **Debug**: `print`, `printf`, `warning`
- **Comments**: `todo`, `fixme`, `header`, block comment

#### Language Configuration
- Improved bracket matching with `<>` for generics
- Better auto-closing pairs including `$"` for assets
- Enhanced folding markers for `#if`/`#endif` blocks
- Improved indentation rules
- On-enter rules for block comments

### Changed
- Updated minimum VS Code version to 1.60.0
- Improved activation events (language-specific instead of `*`)
- Better scope names following TextMate conventions
- Enhanced keyword categorization (control flow, loops, exceptions)

### Fixed
- Vector literals no longer conflict with comparison operators
- Proper handling of negative numbers in various contexts
- Scientific notation support for floats
- Better escape sequence handling in strings

---

## [1.0.0] - Initial Release

- Basic Squirrel language support
- Simple syntax highlighting
- Basic snippets

---

For more information, visit the [GitHub repository](https://github.com/r-ex/vscode-squirrel-re).
