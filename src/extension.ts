import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Go fstrings extension activated");

  // Process any already open Go documents
  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === "go") {
      processGoDocument(document, []);
    }
  });

  // Register document open listener
  const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === "go") {
      processGoDocument(document, []);
    }
  });

  // Register document change listeners
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId === "go") {
      processGoDocument(event.document, event.contentChanges);
    }
  });

  context.subscriptions.push(openListener, changeListener);
}

function processGoDocument(
  document: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
) {
  // Process document
  const edit = new vscode.WorkspaceEdit();

  // Go through each line in the document
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text.trim();

    // Check if line is an fstring comment (supporting multiple formats)
    if (
      text.startsWith("// fstring ") ||
      text.startsWith("//fstring ") ||
      text.startsWith("// fs ") ||
      text.startsWith("//fs ")
    ) {
      handleFstringComment(line, i, document, edit);
    }
  }

  // Apply the edits
  if (edit.size > 0) {
    vscode.workspace.applyEdit(edit);
  }
}

function handleFstringComment(
  line: vscode.TextLine,
  lineIndex: number,
  document: vscode.TextDocument,
  edit: vscode.WorkspaceEdit
) {
  const parsedComment = parseFstringComment(line.text.trim());
  if (!parsedComment) {
    return;
  }

  // Get the indentation of the original line
  const indentation = line.text.substring(
    0,
    line.firstNonWhitespaceCharacterIndex
  );

  // Pass document to generateSprintfStatement
  const generatedCode = generateSprintfStatement(parsedComment, document);

  updateOrInsertGeneratedLine(
    parsedComment,
    generatedCode,
    lineIndex,
    document,
    edit,
    indentation // Pass indentation to the function
  );
}

interface ParsedFstring {
  varName: string;
  assignmentOp: string; // ":=" or "="
  template: string;
  quoteType: string; // Store the quote type (", ', or `)
  variables: { name: string; typeHint: string | null }[];
}

function parseFstringComment(commentText: string): ParsedFstring | null {
  // Extract the part after any of the supported comment styles
  let content: string;
  const trimmedText = commentText.trim();

  if (trimmedText.startsWith("// fstring ")) {
    content = trimmedText.substring(11).trim();
  } else if (trimmedText.startsWith("//fstring ")) {
    content = trimmedText.substring(10).trim();
  } else if (trimmedText.startsWith("// fs ")) {
    content = trimmedText.substring(6).trim();
  } else if (trimmedText.startsWith("//fs ")) {
    content = trimmedText.substring(5).trim();
  } else {
    return null;
  }

  // Match pattern: varName := "template with {vars}" or varName = "template with {vars}"
  // Extended to support single quotes and backticks
  const match = content.match(/^(\w+)\s*((:=)|=)\s*(["'`])(.+?)\4$/);
  if (!match) {
    return null;
  }

  const [, varName, assignmentOp, , quoteType, template] = match;

  // Extract variables inside curly braces, but ignore escaped ones
  const variables: { name: string; typeHint: string | null }[] = [];

  // First, replace escaped braces with temporary markers
  let processedTemplate = template.replace(/\\{/g, "##ESCAPED_OPEN_BRACE##");
  processedTemplate = processedTemplate.replace(
    /\\}/g,
    "##ESCAPED_CLOSE_BRACE##"
  );

  // Now extract actual variables using the processed template
  const variableRegex = /{([^{}:]+)(?::([a-z]))?}/g;
  let varMatch;

  while ((varMatch = variableRegex.exec(processedTemplate)) !== null) {
    variables.push({
      name: varMatch[1].trim(),
      typeHint: varMatch[2] || null, // Extract type hint if provided
    });
  }

  return {
    varName,
    assignmentOp,
    template,
    quoteType, // Include the quote type
    variables,
  };
}

// Format specifier function
function determineFormatSpecifier(
  variable: { name: string; typeHint: string | null },
  document: vscode.TextDocument
): string {
  // First check for explicit type hints
  if (variable.typeHint) {
    switch (variable.typeHint) {
      case "d":
        return "%d"; // integer
      case "f":
        return "%f"; // float
      case "s":
        return "%s"; // string
      case "v":
        return "%v"; // default
      case "t":
        return "%t"; // boolean
      case "x":
        return "%x"; // hex
      case "w":
        return "%w"; // wrapped error
      default:
        return "%v"; // fallback
    }
  }

  // Try to determine the type from the actual variable declaration
  const varType = findVariableType(variable.name, document);
  if (varType) {
    switch (varType) {
      case "int":
      case "int8":
      case "int16":
      case "int32":
      case "int64":
      case "uint":
      case "uint8":
      case "uint16":
      case "uint32":
      case "uint64":
        return "%d";

      case "float32":
      case "float64":
        return "%f";

      case "string":
        return "%s";

      case "bool":
        return "%t";

      case "error":
        return "%w"; // Use %w for error types to support error wrapping

      default:
        if (
          varType.startsWith("map") ||
          varType.startsWith("[]") ||
          varType.startsWith("chan") ||
          varType.startsWith("struct") ||
          varType.startsWith("interface")
        ) {
          return "%v";
        }
        return "%v";
    }
  }

  // Additional heuristic checks for error types based on variable naming
  const varName = variable.name.toLowerCase();
  if (
    varName === "err" ||
    varName === "error" ||
    varName.endsWith("err") ||
    varName.endsWith("error")
  ) {
    return "%w";
  }

  // Fall back to %v when type can't be determined
  return "%v";
}

// Find the variable's type by analyzing the code
function findVariableType(
  variableName: string,
  document: vscode.TextDocument
): string | null {
  const text = document.getText();

  // Try different declaration patterns

  // Pattern 1: Explicit type declaration (var name type = value)
  const explicitPattern = new RegExp(
    `var\\s+${variableName}\\s+(\\w+(?:\\[\\]\\w+)?)\\s*=`,
    "i"
  );
  let match = explicitPattern.exec(text);
  if (match) {
    return match[1];
  }

  // Pattern 2: Short declaration with literal (name := value)
  const shortDeclPattern = new RegExp(
    `${variableName}\\s*:=\\s*(.+?)(?:\\s|\\)|\\}|,|;|$)`,
    "i"
  );
  match = shortDeclPattern.exec(text);
  if (match) {
    const value = match[1].trim();

    // Check the value type
    if (value === "true" || value === "false") {
      return "bool";
    }

    if (/^-?\d+$/.test(value)) {
      return "int";
    }

    if (/^-?\d+\.\d+$/.test(value)) {
      return "float64";
    }

    if (/^".*"$/.test(value) || /^`.*`$/.test(value)) {
      return "string";
    }

    // Error specific pattern - common error creation functions
    if (/^(errors\.New|fmt\.Errorf)\(/.test(value)) {
      return "error";
    }

    if (value.startsWith("[]")) {
      return value; // Return array type e.g. []string
    }

    if (value.startsWith("map[")) {
      return value; // Return map type e.g. map[string]int
    }
  }

  // Pattern 3: Look for explicit type declaration with := from function call
  const funcDeclPattern = new RegExp(
    `${variableName}(?:\\s*,\\s*\\w+)*\\s*:=\\s*(\\w+)\\(`,
    "i"
  );
  match = funcDeclPattern.exec(text);
  if (match) {
    // Return a best guess based on function name
    const funcName = match[1].toLowerCase();
    if (funcName.includes("bool")) {
      return "bool";
    }
    if (funcName.includes("int")) {
      return "int";
    }
    if (funcName.includes("float")) {
      return "float64";
    }
    if (funcName.includes("str")) {
      return "string";
    }
    if (funcName.includes("error") || funcName.includes("err")) {
      return "error";
    }
  }

  // Pattern 4: Error type from function call with error return
  const errorReturnPattern = new RegExp(
    `(?:var\\s+)?${variableName}(?:\\s*,\\s*\\w+)*\\s*:=\\s*\\w+\\.?\\w+\\([^)]*\\)\\s*;?\\s*(?:if|switch)\\s+${variableName}\\s*(?:!=\\s*nil|!=\\s*nil)`,
    "i"
  );
  match = errorReturnPattern.exec(text);
  if (match) {
    return "error"; // Common pattern: err := someFunc(); if err != nil
  }

  return null;
}

function generateSprintfStatement(
  parsedComment: ParsedFstring,
  document: vscode.TextDocument
): string {
  // Replace {var} or {var:type} with appropriate format specifier,
  // but preserve \{var} as literal {var}
  let formatString = parsedComment.template;
  const variableNames: string[] = [];

  // Determine the quote type used in the input
  const quoteType = parsedComment.quoteType || '"';

  // First pass to collect variable names
  parsedComment.variables.forEach((variable) => {
    variableNames.push(variable.name);
  });

  // Handle escaped braces first - replace \{ with a temporary marker
  formatString = formatString.replace(/\\{/g, "##ESCAPED_OPEN_BRACE##");
  formatString = formatString.replace(/\\}/g, "##ESCAPED_CLOSE_BRACE##");

  // Track positions of variables in the format string to replace them with specifiers
  const variablePositions: { 
    start: number; 
    end: number; 
    variable: { name: string; typeHint: string | null }; 
  }[] = [];

  // Get positions of all variables in the template
  let varMatch;
  const regex = /{([^{}:]+)(?::([a-z]))?}/g;
  let processedTemplate = formatString;
  
  while ((varMatch = regex.exec(processedTemplate)) !== null) {
    const fullMatch = varMatch[0];
    const name = varMatch[1].trim();
    const typeHint = varMatch[2] || null;
    
    variablePositions.push({ 
      start: varMatch.index, 
      end: varMatch.index + fullMatch.length,
      variable: { name, typeHint }
    });
  }

  // Replace variables with format specifiers, starting from the end to avoid index shifting
  for (let i = variablePositions.length - 1; i >= 0; i--) {
    const pos = variablePositions[i];
    const formatSpecifier = determineFormatSpecifier(pos.variable, document);
    
    formatString = 
      formatString.substring(0, pos.start) + 
      formatSpecifier + 
      formatString.substring(pos.end);
  }

  // Restore the escaped braces
  formatString = formatString.replace(/##ESCAPED_OPEN_BRACE##/g, "{");
  formatString = formatString.replace(/##ESCAPED_CLOSE_BRACE##/g, "}");

  // Create the full statement using the same quote type as the input
  return `${parsedComment.varName} ${
    parsedComment.assignmentOp
  } fmt.Sprintf(${quoteType}${formatString}${quoteType}, ${variableNames.join(
    ", "
  )})`;
}

function updateOrInsertGeneratedLine(
  parsedComment: ParsedFstring,
  generatedCode: string,
  lineIndex: number,
  document: vscode.TextDocument,
  edit: vscode.WorkspaceEdit,
  indentation: string = "" // Default to empty string if not provided
) {
  // First ensure that fmt is imported
  ensureFmtImport(document, edit);
  const nextLineIndex = lineIndex + 1;

  // Check if we need to insert or replace
  if (nextLineIndex < document.lineCount) {
    const nextLine = document.lineAt(nextLineIndex);

    // If next line contains a generated statement for the same variable, replace it
    if (
      nextLine.text
        .trim()
        .startsWith(parsedComment.varName + " " + parsedComment.assignmentOp)
    ) {
      edit.replace(document.uri, nextLine.range, indentation + generatedCode);
      return;
    }
  }

  function ensureFmtImport(
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit
  ) {
    // Check if fmt is already imported
    const text = document.getText();

    // Simple import check (could be more sophisticated)
    if (
      !/import\s+\(\s*[\s\S]*?["']fmt["'][\s\S]*?\)/m.test(text) &&
      !/import\s+["']fmt["']/m.test(text)
    ) {
      // Find the position to insert the import
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text.trim();
        if (line.startsWith("package ")) {
          // Insert after package line
          const position = new vscode.Position(i + 1, 0);
          edit.insert(document.uri, position, '\nimport "fmt"\n');
          break;
        }
      }
    }
  }

  // Otherwise insert a new line
  const position = new vscode.Position(lineIndex + 1, 0);
  edit.insert(document.uri, position, indentation + generatedCode + "\n");
}

export function deactivate() {}
