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
  // Skip processing if changes are likely from undo/redo operations
  if (changes.length > 0) {
    // Check if this appears to be an undo/redo operation
    if (isLikelyUndoRedo(changes)) {
      return;
    }
  }

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

// Helper function to detect likely undo/redo operations
function isLikelyUndoRedo(
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): boolean {
  // Undo/redo operations often have multiple changes in a single event
  if (changes.length > 1) {
    return true;
  }

  // If there's a single large change that replaces significant content,
  // it's likely an undo/redo
  if (changes.length === 1) {
    const change = changes[0];
    // Check if the change is replacing content (likely undo/redo)
    if (
      change.range &&
      (change.range.start.line !== change.range.end.line ||
        change.range.start.character !== change.range.end.character)
    ) {
      return true;
    }
  }

  return false;
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
  const generatedCode = generateSprintfStatement(parsedComment);
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
  variables: string[];
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
  const match = content.match(/^(\w+)\s*((:=)|=)\s*"(.+)"$/);
  if (!match) {
    return null;
  }

  const [, varName, assignmentOp, , template] = match;

  // Extract variables inside curly braces
  const variables: string[] = [];
  const variableRegex = /{([^{}]+)}/g;
  let varMatch;

  while ((varMatch = variableRegex.exec(template)) !== null) {
    variables.push(varMatch[1].trim());
  }

  return {
    varName,
    assignmentOp,
    template,
    variables,
  };
}

function generateSprintfStatement(parsedComment: ParsedFstring): string {
  // Replace {var} with %s
  let formatString = parsedComment.template.replace(/{([^{}]+)}/g, "%s");

  // Create the full statement
  return `${parsedComment.varName} ${
    parsedComment.assignmentOp
  } fmt.Sprintf("${formatString}", ${parsedComment.variables.join(", ")})`;
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
