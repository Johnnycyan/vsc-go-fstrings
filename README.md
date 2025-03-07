# Go f-strings for VS Code

A VS Code extension that brings Python-like f-string syntax to Go through special comments.

![Example](https://github.com/user-attachments/assets/c0113533-dfff-4b60-8c74-f0ee4e298ce1)

## Features

This extension allows you to write string formatting in Go using a more concise, Python-inspired f-string syntax. It automatically converts special comments into equivalent `fmt.Sprintf` statements.

Simply write a comment with the syntax:

```go
// fstring result := "Hello, {name}!"
```

And it will automatically be converted to:

```go
result := fmt.Sprintf("Hello, %s!", name)
```

The extension also ensures that the `fmt` package is imported when needed.

### Supported Comment Styles

You can use any of the following comment styles:
* `// fstring`
* 
* `// fs`
* 

### Assignment Types

The extension supports both `:=` and `=` assignment operators:

```go
// fstring result := "Hello, {name}!"  // Uses :=
// fstring existingVar = "Value: {value}"  // Uses =
```

### Type Hints

You can provide formatting type hints using colon syntax:

```go
// fstring result := "Integer: {number:d}, Float: {price:f}, String: {name:s}"
```

Supported type hints:
- `d`: Integer format (`%d`)
- `f`: Float format (`%f`) 
- `s`: String format (`%s`)
- `v`: Default format (`%v`)
- `t`: Boolean format (`%t`)
- `x`: Hex format (`%x`)
- `w`: Wrapped error format (`%w`)

### Smart Type Detection

The extension attempts to automatically detect variable types from your code when no explicit type hint is provided:
- Variables like `err` or ending with `err`/`error` are treated as error types (`%w`)
- Numeric, string, boolean and other types are detected based on declarations in your code

### Escaping Braces

You can include literal braces in your strings by escaping them:

```go
// fstring message := "Use \{variable} to show literal braces"
```

## How It Works

- Add a comment with one of the supported prefixes followed by a variable assignment and string with placeholders in curly braces
- The extension automatically converts this to a proper Go `fmt.Sprintf` statement on the next line
- The conversion happens when you open Go files or make changes to them

## Requirements

- VS Code version 1.98.0 or higher
- Working with Go files

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X)
3. Search for "Go f-strings"
4. Click Install

### From VSIX File

1. Package the extension: `npm install -g @vscode/vsce && vsce package`
2. Install in VS Code:
   - From Extensions view: Click `...` > `Install from VSIX...`
   - Or using command line: `code --install-extension go-fstrings-1.0.4.vsix`

### From Source

1. Clone the repository
2. Run `npm install`
3. Press F5 to launch the extension in development mode

## Known Issues

- Complex expressions inside curly braces may not work as expected
- Type detection is based on basic pattern matching and may not work for all variable declarations

## License

This extension is licensed under the MIT License.