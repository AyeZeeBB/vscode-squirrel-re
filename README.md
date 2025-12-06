# Squirrel (Respawn) - VS Code Extension

![Version](https://img.shields.io/badge/version-2.6.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Full-featured language support for **Respawn Entertainment** games including Apex Legends and Titanfall. This extension provides comprehensive IntelliSense, syntax highlighting, snippets, and language configuration for all script and config file types.

![Syntax Highlighting Preview](acorn.png)

## Supported File Types

| Extension | Language | Description |
|-----------|----------|-------------|
| `.nut` | Squirrel | Server/Client/UI scripts |
| `.gnut` | Squirrel | Global squirrel scripts |
| `.rson` | RSON | Respawn JSON config files |
| `.res` | KeyValues | UI panel/resource files |
| `.menu` | KeyValues | Menu definition files |
| `.txt` (weapons/) | KeyValues | Weapon configuration files |
| `.txt` (aisettings/) | KeyValues | AI settings files |

## Features

### 🧠 IntelliSense

Full autocomplete support for Respawn's Squirrel dialect:

| Feature | Description |
|---------|-------------|
| **Local Struct Variables** | `struct { ... } file` or any variable name - type `file.` to see members |
| **Global Structs** | `global struct MyStruct { }` - type completion and member access |
| **Enums** | Local and global enums - type `EnumName.` to see values |
| **Global Functions** | Parsed from all open `.nut`/`.gnut` files |
| **Global Constants** | `global const int`, `global const table<>`, etc. |
| **Built-in Functions** | 50+ common Respawn functions with signatures |
| **Keywords & Types** | All Squirrel keywords, types, and modifiers |

#### Local Struct Completion

```squirrel
struct {
    bool isActive
    int count
    array<entity> targets
} file

// Type "file." to see: isActive, count, targets
```

Works with any variable name, not just `file`:

```squirrel
struct {
    array<PakHandle> pakHandles
    table<string, int> pakLoadStatuses
} s_pakData

// Type "s_pakData." to see: pakHandles, pakLoadStatuses
```

#### Global Struct & Enum Completion

```squirrel
global struct PlayerData {
    entity player
    int score
    vector spawnPos
}

global enum eGameState {
    LOBBY,
    PLAYING,
    GAME_OVER
}

// Type "PlayerData" for struct type completion
// Type "eGameState." to see: LOBBY, PLAYING, GAME_OVER
```

#### Global Function & Constant Completion

```squirrel
global function MyGlobalFunction
global const bool FEATURE_ENABLED = true
global const table<string, int> LOOKUP_TABLE = { ... }

// All globals from open files appear in autocomplete
```

### 🎨 Squirrel Syntax Highlighting

- **Typed Functions**: `void function`, `int function`, `bool function`, `array<T> function`, etc.
- **Generics**: Full support for `array<T>` and `table<K, V>` types
- **Structs & Enums**: Global and local struct/enum definitions with member highlighting
- **Preprocessor**: `#if SERVER`, `#elseif CLIENT`, `#endif`, `#document`
- **Platform Constants**: `SERVER`, `CLIENT`, `UI`, `DEV`, `DEVELOPER`, etc.
- **Vector Literals**: `<x, y, z>` vector syntax
- **Asset Literals**: `$"path/to/asset.rmdl"` asset references
- **Threading**: `thread`, `wait`, `waitthread`, `EndSignal`, `WaitSignal`

### 🔧 KeyValues Syntax Highlighting (Weapons/UI)

- **`#base` includes**: File inheritance highlighting
- **Key-Value pairs**: Both quoted and unquoted formats
- **Nested blocks**: `WeaponData { }`, `Mods { }`, control definitions
- **Platform conditionals**: `[$PC]`, `[$GAMECONSOLE]`, etc.
- **Special values**: Colors (`255 255 255`), percentages (`%100`), format values (`f0`)
- **Damage flags**: `DF_BULLET | DF_KNOCK_BACK | DF_DISMEMBERMENT`
- **Localization**: `#LOCALIZATION_KEY` references
- **Asset paths**: `.rpak`, `.rui`, `.res`, `.menu` file references

### 📝 RSON Support

- Respawn's custom JSON-like format
- `When:` / `Scripts:` block highlighting
- Platform constants and conditional logic

### ✨ Snippets

**60+ Squirrel snippets** including:
- `vf`, `bf`, `if`, `sf` - Typed function declarations
- `struct`, `genum` - Data structure definitions
- `thread`, `waitthread` - Threading patterns
- `#server`, `#client`, `#ui` - Preprocessor blocks
- `template_shared`, `template_server` - File templates

**30+ KeyValues snippets** including:
- `WeaponData` - Weapon configuration block
- `Mods`, `mod` - Mod definitions
- `ruibutton`, `ruipanel`, `label` - UI control definitions
- `pin` - Pin to sibling positioning
- `menuroot` - Menu file template
- `control`, `nestedpanel` - Generic controls

## Installation

### From VSIX

1. Download the latest `.vsix` file from releases
2. In VS Code/Cursor, press `Ctrl+Shift+P`
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded file

### Manual Installation

1. Clone this repository to your VS Code extensions folder:
   - Windows: `%USERPROFILE%\.vscode\extensions\`
   - macOS/Linux: `~/.vscode/extensions/`
2. Restart VS Code

## Usage Tips

### Maximize IntelliSense

For best IntelliSense experience, **open multiple script files** in your workspace. The extension scans all open `.nut` and `.gnut` files for:
- Global function declarations
- Global struct definitions
- Global enum definitions
- Global constants and variables

### Usage Examples

#### Squirrel Script

```squirrel
#if SERVER
global function SpawnWeaponRack

struct {
    array<entity> spawnedRacks
    int maxRacks
} file

void function SpawnWeaponRack(vector origin, vector angles)
{
    entity rack = CreateEntity("prop_dynamic")
    rack.SetOrigin(origin)
    rack.SetAngles(angles)
    
    file.spawnedRacks.append(rack)
    thread MonitorRack(rack)
}

void function MonitorRack(entity rack)
{
    EndSignal(rack, "OnDestroy")
    
    while (IsValid(rack))
    {
        wait 1.0
    }
}
#endif
```

#### Weapon Config (.txt)

```keyvalues
#base "_base_assault_rifle.txt"

WeaponData
{
    "weaponClass"                     "human"
    "weaponSubClass"                  "rifle"
    
    "damage_type"                     "bullet"
    "damage_flags"                    "DF_BULLET | DF_KNOCK_BACK"
    
    "damage_near_value"               "25"
    "damage_far_value"                "20"
    "damage_near_distance"            "1000"
    "damage_far_distance"             "2500"
    
    Mods
    {
        hopup_turbocharger
        {
            "fire_rate"               "*1.25"
        }
    }
}
```

#### UI Panel (.res)

```keyvalues
"scripts/resource/ui/menus/panels/my_panel.res"
{
    Screen
    {
        ControlName             Label
        wide                    %100
        tall                    %100
        visible                 0
    }

    MyButton
    {
        ControlName             RuiButton
        wide                    200
        tall                    50
        rui                     "ui/generic_button.rpak"
        visible                 1
        
        pin_to_sibling          Screen
        pin_corner_to_sibling   CENTER
        pin_to_sibling_corner   CENTER
        
        ruiArgs
        {
            buttonText          "#MY_BUTTON_TEXT"
        }
    }
}
```

## Configuration

The extension sets sensible defaults:

```json
{
  "[squirrel]": {
    "editor.tabSize": 4,
    "editor.insertSpaces": false,
    "editor.bracketPairColorization.enabled": true,
    "editor.quickSuggestions": {
      "other": true,
      "comments": false,
      "strings": false
    }
  },
  "[respawn-keyvalues]": {
    "editor.tabSize": 4,
    "editor.insertSpaces": false
  }
}
```

## File Type Detection

The extension automatically detects KeyValues format for:
- All `.res` files
- All `.menu` files
- `.txt` files in `weapons/`, `aisettings/`, `turrets/`, `damage/` folders

For other `.txt` files, you can manually set the language mode to "Respawn KeyValues".

## Changelog

### v2.6.0
- Added local struct variable completion for any variable name (not just `file`)
- Added global constant and variable completion (`global const int`, `global table<>`, etc.)
- Improved struct member parsing for complex types with `#if`/`#endif` blocks

### v2.4.0
- Added global function completion from all open Squirrel files
- Global functions show return type, parameters, and source file

### v2.3.0
- Added global struct completion with member preview
- Added enum completion (local and global)
- Added variable type tracking for struct member completion
- Improved parsing for complex generic types (`table<string, functionref(...)>`)

### v2.0.0
- Complete rewrite of Squirrel syntax highlighting
- Added RSON language support
- Added KeyValues language support (.res, .menu, weapon .txt files)
- Added 60+ Squirrel snippets and 30+ KeyValues snippets

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests on [GitHub](https://github.com/r-ex/vscode-squirrel-re).

## Credits

- Based on [mepsoid/vscode-s-quirrel](https://github.com/mepsoid/vscode-s-quirrel)
- Developed for the [R5Reloaded](https://r5reloaded.com/) community

## License

MIT License - see [LICENSE](LICENSE) for details.
