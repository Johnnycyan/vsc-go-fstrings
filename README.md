Go f-strings for VS Code
A VS Code extension that brings Python-like f-string syntax to Go through special comments.

Features
This extension allows you to write string formatting in Go using a more concise, Python-inspired f-string syntax. It automatically converts special comments into equivalent fmt.Sprintf statements.

Simply write a comment with the syntax:

And it will automatically be converted to:

The extension also ensures that the fmt package is imported when needed.

How It Works
Add a comment starting with // fstring followed by a variable assignment and string with placeholders in curly braces
The extension automatically converts this to a proper Go fmt.Sprintf statement on the next line
The conversion happens when you open Go files or make changes to them
Requirements
VS Code version 1.98.0 or higher
Working with Go files
Installation
From VSIX File
Package the extension: npm install -g @vscode/vsce && vsce package
Install in VS Code:
From Extensions view: Click ... > Install from VSIX...
Or using command line: code --install-extension go-fstrings-0.0.1.vsix
From Source
Clone the repository
Run npm install
Press F5 to launch the extension in development mode
Known Issues
This is an early version with basic functionality. Complex expressions inside curly braces may not work as expected.

Release Notes
0.0.1
Initial release
Basic f-string to fmt.Sprintf conversion
Automatic fmt package import
For more information
VS Code Extension API
Go fmt package documentation
Enjoy!