import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("Extension Test Suite", () => {
  test("f-string comment conversion test", async () => {
    // Create a temporary file
    const tempFile = path.join(os.tmpdir(), "test.go");
    fs.writeFileSync(
      tempFile,
      `package main

// fstring message := "Hello {name}, you are {age} years old"
`
    );

    // Open the file in the editor
    const document = await vscode.workspace.openTextDocument(tempFile);
    await vscode.window.showTextDocument(document);

    // Wait for the extension to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the updated document content
    const text = document.getText();

    assert.strictEqual(
      text.includes(
        'message := fmt.Sprintf("Hello %s, you are %s years old", name, age)'
      ),
      true
    );
  });
});
