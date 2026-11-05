// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {

  // Create a decorator types that we use to decorate indent levels
  let decorationTypes = [];

  let doIt = false;
  let clearMe = false;
  let currentLanguageId = null;
  let skipAllErrors = false;

  let activeEditor = vscode.window.activeTextEditor;

  // Error color gets shown when tabs aren't right,
  //  e.g. when you have your tabs set to 2 spaces but the indent is 3 spaces
  const error_color = vscode.workspace.getConfiguration('indentRainbow')['errorColor'] || "rgba(128,32,32,0.3)";
  const error_decoration_type = vscode.window.createTextEditorDecorationType({
    backgroundColor: error_color
  });

  const tabmix_color = vscode.workspace.getConfiguration('indentRainbow')['tabmixColor'] || "";
  const tabmix_decoration_type = "" !== tabmix_color ? vscode.window.createTextEditorDecorationType({
     backgroundColor: tabmix_color
  }) : null;

  const ignoreLinePatterns = vscode.workspace.getConfiguration('indentRainbow')['ignoreLinePatterns'] || [];
  const colorOnWhiteSpaceOnly = vscode.workspace.getConfiguration('indentRainbow')['colorOnWhiteSpaceOnly'] || false;
  const indicatorStyle = vscode.workspace.getConfiguration('indentRainbow')['indicatorStyle'] || 'classic';
  const lightIndicatorStyleLineWidth = vscode.workspace.getConfiguration('indentRainbow')['lightIndicatorStyleLineWidth'] || 1;

  // Colors will cycle through, and can be any size that you want
  const colors = vscode.workspace.getConfiguration('indentRainbow')['colors'] || [
    "rgba(255,255,64,0.07)",
    "rgba(127,255,127,0.07)",
    "rgba(255,127,255,0.07)",
    "rgba(79,236,236,0.07)"
  ];

  // Loops through colors and creates decoration types for each one
  colors.forEach((color, index) => {
    if (indicatorStyle === 'classic') {
      decorationTypes[index] = vscode.window.createTextEditorDecorationType({
        backgroundColor: color
      });
    } else if (indicatorStyle === 'light') {
      decorationTypes[index] = vscode.window.createTextEditorDecorationType({
        borderStyle: "solid",
        borderColor: color,
        borderWidth: `0 0 0 ${lightIndicatorStyleLineWidth}px`
      });
    }
  });

  // loop through ignore regex strings and convert to valid RegEx's.
  ignoreLinePatterns.forEach((ignorePattern,index) => {
    if (typeof ignorePattern === 'string') {
      var regParts = ignorePattern.match(/^\/(.*?)\/([gim]*)$/);
      if (regParts) {
        ignoreLinePatterns[index] = new RegExp(regParts[1], regParts[2]);
      } else {
        ignoreLinePatterns[index] = new RegExp(ignorePattern);
      }
    }
  });

  if(activeEditor) {
    indentConfig();
  }

  if (activeEditor && checkLanguage()) {
    triggerUpdateDecorations();
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) {
      indentConfig();
    }

    if (editor && checkLanguage()) {
      triggerUpdateDecorations();
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    if(activeEditor) {
      indentConfig();
    }

    if (activeEditor && event.document === activeEditor.document && checkLanguage()) {
      triggerUpdateDecorations();
    }
  }, null, context.subscriptions);

  function indentConfig() {
    var skiplang = vscode.workspace.getConfiguration('indentRainbow')['ignoreErrorLanguages'] || [];
    skipAllErrors = false;
    if(skiplang.length !== 0) {
      if(skiplang.indexOf('*') !== -1 || skiplang.indexOf(currentLanguageId) !== -1) {
        skipAllErrors = true;
      }
    }
  }

  function checkLanguage() {
    if (activeEditor) {
      if(currentLanguageId !== activeEditor.document.languageId) {
        var inclang = vscode.workspace.getConfiguration('indentRainbow')['includedLanguages'] || [];
        var exclang = vscode.workspace.getConfiguration('indentRainbow')['excludedLanguages'] || [];

        currentLanguageId = activeEditor.document.languageId;
        doIt = true;
        if(inclang.length !== 0) {
          if(inclang.indexOf(currentLanguageId) === -1) {
            doIt = false;
          }
        }

        if(doIt && exclang.length !== 0) {
          if(exclang.indexOf(currentLanguageId) !== -1) {
            doIt = false;
          }
        }
      }
    }

    if( clearMe && ! doIt) {
      var decor: vscode.DecorationOptions[] = [];
      for (let decorationType of decorationTypes) {
        activeEditor.setDecorations(decorationType, decor);
      }
      clearMe = false;
    }

    indentConfig();

    return doIt;
  }

  var timeout = null;
  function triggerUpdateDecorations() {
    if (timeout) {
      clearTimeout(timeout);
    }
    var updateDelay = vscode.workspace.getConfiguration('indentRainbow')['updateDelay'] || 100;
    timeout = setTimeout(updateDecorations, updateDelay);
  }

  function updateDecorations() {
    if (!activeEditor) {
      return;
    }
    
    var document = activeEditor.document;
    var text = document.getText();
    var tabSizeRaw = activeEditor.options.tabSize;
    var tabSize = 4;
    if (tabSizeRaw !== 'auto') {
      tabSize = +tabSizeRaw;
    }
    var tabs = " ".repeat(tabSize);

    const ignoreLines = [];
    let error_decorator: vscode.DecorationOptions[] = [];
    let tabmix_decorator: vscode.DecorationOptions[] = tabmix_decoration_type ? [] : null;
    let decorators = [];
    decorationTypes.forEach(() => {
      let decorator: vscode.DecorationOptions[] = [];
      decorators.push(decorator);
    });

    if (!skipAllErrors) {
      ignoreLinePatterns.forEach(ignorePattern => {
        let ignore;
        while (ignore = ignorePattern.exec(text)) {
          const pos = document.positionAt(ignore.index);
          const line = document.lineAt(pos).lineNumber;
          ignoreLines.push(line);
        }
      });
    }

    var re = new RegExp("\t", "g");

    // مرور على جميع الأسطر في المستند لضمان معالجة الأسطر العادية والفارغة معاً
    for (let i = 0; i < document.lineCount; i++) {
      var lineObj = document.lineAt(i);
      var lineText = lineObj.text;
      
      // فحص إذا كان السطر فارغاً تماماً أو يحتوي على مسافات فقط
      var isEmptyLine = lineText.trim() === "";
      var indentMatch = lineText.match(/^[\t ]+/);
      
      let indentSpacesLength = 0;
      let indentRawText = "";

      if (indentMatch) {
        indentRawText = indentMatch[0];
        indentSpacesLength = indentRawText.replace(re, tabs).length;
      } else if (isEmptyLine) {
        // إذا كان السطر فارغاً، نبحث عن مستوى البادئة من السطر الذي قبله أو بعده لتوحيد السياق
        let targetIndent = "";
        for (let prev = i - 1; prev >= 0; prev--) {
          let pText = document.lineAt(prev).text;
          if (pText.trim() !== "") {
            let pMatch = pText.match(/^[\t ]+/);
            if (pMatch) {
              targetIndent = pMatch[0];
            }
            break;
          }
        }
        if (!targetIndent && i + 1 < document.lineCount) {
          for (let next = i + 1; next < document.lineCount; next++) {
            let nText = document.lineAt(next).text;
            if (nText.trim() !== "") {
              let nMatch = nText.match(/^[\t ]+/);
              if (nMatch) {
                targetIndent = nMatch[0];
              }
              break;
            }
          }
        }
        if (targetIndent) {
          indentRawText = targetIndent;
          indentSpacesLength = indentRawText.replace(re, tabs).length;
        }
      }

      if (indentSpacesLength > 0) {
        let skip = skipAllErrors || ignoreLines.indexOf(i) !== -1;

        if (!skip && indentSpacesLength % tabSize !== 0) {
          var startPos = new vscode.Position(i, 0);
          var endPos = new vscode.Position(i, indentRawText.length);
          var decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: null };
          error_decorator.push(decoration);
        } else {
          var m = indentRawText;
          var l = m.length;
          var n = 0;
          var o = 0;
          while (n < l) {
            var startPos = new vscode.Position(i, n);
            if (m[n] === "\t") {
              n++;
            } else {
              n += tabSize;
            }
            if (colorOnWhiteSpaceOnly && n > l) {
              n = l;
            }
            var endPos = new vscode.Position(i, n);
            var decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: null };
            
            var tc = (m.split("\t").length - 1);
            var sc = (m.split(" ").length - 1);

            if (!skip && sc > 0 && tc > 0 && tabmix_decorator) {
              tabmix_decorator.push(decoration);
            } else {
              let decorator_index = o % decorators.length;
              decorators[decorator_index].push(decoration);
            }
            o++;
          }
        }
      }
    }

    decorationTypes.forEach((decorationType, index) => {
      activeEditor.setDecorations(decorationType, decorators[index]);
    });
    activeEditor.setDecorations(error_decoration_type, error_decorator);
    tabmix_decoration_type && activeEditor.setDecorations(tabmix_decoration_type, tabmix_decorator);
    clearMe = true;
  }

  vscode.workspace.onDidChangeConfiguration(configChangeEvent => {
    if (configChangeEvent.affectsConfiguration('indentRainbow')) {
      const actions = ['Reload now', 'Later'];

      vscode.window
        .showInformationMessage('The VSCode window needs to reload for the changes to take effect. Would you like to reload the window now?', ...actions)
        .then(action => {
          if (action === actions[0]) {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
    }
  });
}
