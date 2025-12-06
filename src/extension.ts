import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Respawn Squirrel extension activated');

    const squirrelSelector: vscode.DocumentSelector = [
        { language: 'squirrel', scheme: 'file' },
        { language: 'squirrel', scheme: 'untitled' }
    ];

    // Create the document parser
    const documentParser = new SquirrelDocumentParser();

    // Struct member completion (handles file., and any typed variable.)
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new StructMemberCompletionProvider(documentParser),
            '.'
        )
    );

    // Enum completion (EnumName.VALUE)
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new EnumCompletionProvider(documentParser),
            '.'
        )
    );

    // Global struct type name completion
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new GlobalStructCompletionProvider(documentParser)
        )
    );

    // Keyword and type completion
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new KeywordCompletionProvider()
        )
    );

    // Built-in global function completion (hardcoded common functions)
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new BuiltinFunctionCompletionProvider()
        )
    );

    // Script global function completion (parsed from open files)
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new ScriptGlobalFunctionCompletionProvider(documentParser)
        )
    );

    // Global constants/variables completion
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new GlobalConstantCompletionProvider(documentParser)
        )
    );

    // Enum name completion
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            squirrelSelector,
            new EnumNameCompletionProvider(documentParser)
        )
    );
}

export function deactivate() {}

// ============================================================================
// Document Parser - Parses structs, enums, functions, and constants
// ============================================================================

interface StructMember {
    type: string;
    name: string;
    defaultValue?: string;
}

interface EnumDef {
    name: string;
    isGlobal: boolean;
    values: string[];
}

interface StructDef {
    name: string;
    isGlobal: boolean;
    members: StructMember[];
}

interface VariableDecl {
    name: string;
    type: string;
    line: number;
}

interface FunctionDef {
    name: string;
    returnType: string;
    params: string;
    isGlobal: boolean;
    sourceFile: string;
}

interface ConstantDef {
    name: string;
    type: string;
    value: string;
    isGlobal: boolean;
    isConst: boolean;
    sourceFile: string;
}

interface LocalStructVar {
    name: string;
    members: StructMember[];
}

class SquirrelDocumentParser {
    
    /**
     * Parse all local struct variables (struct { ... } varName)
     */
    parseLocalStructVars(text: string): LocalStructVar[] {
        const structs: LocalStructVar[] = [];
        
        // Match: struct { ... } varName
        // Need to handle nested braces and preprocessor directives
        const structStartRegex = /\bstruct\s*\{/g;
        let match;
        
        while ((match = structStartRegex.exec(text)) !== null) {
            // Check if this is a global struct (has 'global' before it)
            const before = text.substring(Math.max(0, match.index - 20), match.index);
            if (/global\s*$/.test(before)) {
                continue; // Skip global struct definitions
            }
            
            const startIndex = match.index + match[0].length;
            const body = this.extractBraceContent(text, startIndex);
            
            if (body !== null) {
                // Find the variable name after the closing brace
                const afterBrace = text.substring(startIndex + body.length + 1);
                const varNameMatch = afterBrace.match(/^\s*(\w+)/);
                
                if (varNameMatch) {
                    const name = varNameMatch[1];
                    const members = this.parseStructMembers(body);
                    structs.push({ name, members });
                }
            }
        }
        
        return structs;
    }

    /**
     * Parse the file struct (struct { ... } file) - legacy method
     */
    parseFileStruct(text: string): StructMember[] {
        const structs = this.parseLocalStructVars(text);
        const fileStruct = structs.find(s => s.name === 'file');
        return fileStruct ? fileStruct.members : [];
    }
    
    /**
     * Get members for a specific local struct variable
     */
    getLocalStructMembers(text: string, varName: string): StructMember[] | undefined {
        const structs = this.parseLocalStructVars(text);
        const struct = structs.find(s => s.name === varName);
        return struct?.members;
    }

    /**
     * Parse all enums in the document
     */
    parseEnums(text: string): EnumDef[] {
        const enums: EnumDef[] = [];
        
        const enumRegex = /(global\s+)?enum\s+(\w+)\s*\{([^}]*)\}/g;
        let match;
        
        while ((match = enumRegex.exec(text)) !== null) {
            const isGlobal = !!match[1];
            const name = match[2];
            const body = match[3];
            
            const values: string[] = [];
            const lines = body.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('//')) continue;
                
                const valueMatch = trimmed.match(/^(\w+)/);
                if (valueMatch) {
                    values.push(valueMatch[1]);
                }
            }
            
            enums.push({ name, isGlobal, values });
        }
        
        return enums;
    }

    /**
     * Parse all global structs in the document
     */
    parseGlobalStructs(text: string): StructDef[] {
        const structs: StructDef[] = [];
        
        const structRegex = /global\s+struct\s+(\w+)\s*\{/g;
        let match;
        
        while ((match = structRegex.exec(text)) !== null) {
            const name = match[1];
            const startIndex = match.index + match[0].length;
            
            const body = this.extractBraceContent(text, startIndex);
            if (body) {
                const members = this.parseStructMembers(body);
                structs.push({ name, isGlobal: true, members });
            }
        }
        
        return structs;
    }

    /**
     * Parse global functions from a document
     */
    parseGlobalFunctions(text: string, sourceFile: string): FunctionDef[] {
        const functions: FunctionDef[] = [];
        const seen = new Set<string>();
        
        // Find forward declarations: global function FunctionName
        const forwardDeclRegex = /^[ \t]*global\s+function\s+(\w+)\s*$/gm;
        let match;
        
        while ((match = forwardDeclRegex.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name)) {
                seen.add(name);
                functions.push({
                    name,
                    returnType: 'void',
                    params: '',
                    isGlobal: true,
                    sourceFile
                });
            }
        }
        
        // Find actual function definitions with return types
        const funcDefRegex = /^[ \t]*([\w<>,\s]+?)\s+function\s+(\w+)\s*\(([^)]*)\)/gm;
        
        while ((match = funcDefRegex.exec(text)) !== null) {
            const returnType = match[1].trim();
            const name = match[2];
            const params = match[3].trim();
            
            if (returnType === 'local' || returnType === 'global' || returnType.includes('=')) {
                continue;
            }
            
            const existing = functions.find(f => f.name === name);
            if (existing) {
                existing.returnType = returnType;
                existing.params = params;
            } else if (!seen.has(name)) {
                seen.add(name);
                functions.push({
                    name,
                    returnType,
                    params,
                    isGlobal: false,
                    sourceFile
                });
            }
        }
        
        return functions.filter(f => f.isGlobal);
    }

    /**
     * Parse global constants and variables from a document
     */
    parseGlobalConstants(text: string, sourceFile: string): ConstantDef[] {
        const constants: ConstantDef[] = [];
        const seen = new Set<string>();
        
        // Pattern 1: global const TYPE NAME = VALUE
        // Pattern 2: global TYPE NAME = VALUE (global variable)
        // Pattern 3: global const NAME = VALUE (untyped const)
        
        const patterns = [
            // global const TYPE NAME = VALUE (handles generics like table<string, bool>)
            /^[ \t]*global\s+const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.+?)$/gm,
            // global TYPE NAME = VALUE (global variable, not const)
            /^[ \t]*global\s+((?!function|struct|enum|const)[\w<>,\s]+?)\s+(\w+)\s*=\s*(.+?)$/gm,
            // global const NAME = VALUE (untyped)
            /^[ \t]*global\s+const\s+(\w+)\s*=\s*(.+?)$/gm,
        ];
        
        // global const TYPE NAME = VALUE
        let match;
        const typedConstRegex = /^[ \t]*global\s+const\s+([\w<>,\s]+?)\s+(\w+)\s*=/gm;
        while ((match = typedConstRegex.exec(text)) !== null) {
            const type = match[1].trim();
            const name = match[2];
            
            // Skip if type looks like a name (no valid type keyword)
            if (!this.isValidType(type)) continue;
            
            if (!seen.has(name)) {
                seen.add(name);
                // Extract value (simplified - just get the rest of line)
                const lineEnd = text.indexOf('\n', match.index);
                const fullLine = text.substring(match.index, lineEnd === -1 ? text.length : lineEnd);
                const valueMatch = fullLine.match(/=\s*(.+?)$/);
                const value = valueMatch ? valueMatch[1].trim() : '';
                
                constants.push({
                    name,
                    type,
                    value,
                    isGlobal: true,
                    isConst: true,
                    sourceFile
                });
            }
        }
        
        // global TYPE NAME = VALUE (not const, not function/struct/enum)
        const globalVarRegex = /^[ \t]*global\s+(?!const|function|struct|enum)([\w<>,\s]+?)\s+(\w+)\s*=/gm;
        while ((match = globalVarRegex.exec(text)) !== null) {
            const type = match[1].trim();
            const name = match[2];
            
            if (!this.isValidType(type)) continue;
            
            if (!seen.has(name)) {
                seen.add(name);
                const lineEnd = text.indexOf('\n', match.index);
                const fullLine = text.substring(match.index, lineEnd === -1 ? text.length : lineEnd);
                const valueMatch = fullLine.match(/=\s*(.+?)$/);
                const value = valueMatch ? valueMatch[1].trim() : '';
                
                constants.push({
                    name,
                    type,
                    value,
                    isGlobal: true,
                    isConst: false,
                    sourceFile
                });
            }
        }
        
        return constants;
    }

    /**
     * Check if a string looks like a valid type
     */
    private isValidType(type: string): boolean {
        const baseTypes = ['void', 'int', 'float', 'bool', 'string', 'vector', 'entity', 'asset', 'var', 'array', 'table', 'function', 'functionref'];
        const base = type.split('<')[0].trim();
        return baseTypes.includes(base) || /^[A-Z]/.test(base); // Built-in or PascalCase (struct type)
    }

    /**
     * Get all global functions from all open documents
     */
    getAllGlobalFunctions(): FunctionDef[] {
        const allFunctions: FunctionDef[] = [];
        const seen = new Set<string>();
        
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel') {
                const fileName = doc.uri.fsPath.split(/[/\\]/).pop() || 'unknown';
                const functions = this.parseGlobalFunctions(doc.getText(), fileName);
                for (const func of functions) {
                    if (!seen.has(func.name)) {
                        seen.add(func.name);
                        allFunctions.push(func);
                    }
                }
            }
        }
        
        return allFunctions;
    }

    /**
     * Get all global constants from all open documents
     */
    getAllGlobalConstants(): ConstantDef[] {
        const allConstants: ConstantDef[] = [];
        const seen = new Set<string>();
        
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel') {
                const fileName = doc.uri.fsPath.split(/[/\\]/).pop() || 'unknown';
                const constants = this.parseGlobalConstants(doc.getText(), fileName);
                for (const constant of constants) {
                    if (!seen.has(constant.name)) {
                        seen.add(constant.name);
                        allConstants.push(constant);
                    }
                }
            }
        }
        
        return allConstants;
    }

    /**
     * Get all global structs from all open documents
     */
    getAllGlobalStructs(): StructDef[] {
        const allStructs: StructDef[] = [];
        const seen = new Set<string>();
        
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel') {
                const structs = this.parseGlobalStructs(doc.getText());
                for (const struct of structs) {
                    if (!seen.has(struct.name)) {
                        seen.add(struct.name);
                        allStructs.push(struct);
                    }
                }
            }
        }
        
        return allStructs;
    }

    /**
     * Find a struct by name across all documents
     */
    findStructByName(name: string): StructDef | undefined {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel') {
                const structs = this.parseGlobalStructs(doc.getText());
                const found = structs.find(s => s.name === name);
                if (found) return found;
            }
        }
        return undefined;
    }

    /**
     * Parse variable declarations from text up to a certain position
     */
    parseVariables(text: string, upToLine: number): VariableDecl[] {
        const variables: VariableDecl[] = [];
        const lines = text.split('\n');
        
        for (let lineNum = 0; lineNum < Math.min(lines.length, upToLine + 1); lineNum++) {
            const line = lines[lineNum];
            
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
            
            const declPatterns = [
                /(?:local\s+)?(\w+(?:<[^>]+>)?(?:\s+ornull)?)\s+(\w+)\s*(?:=|$|,|\))/g,
                /(?:foreach|for)\s*\(\s*(?:\w+\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s+in/g,
                /function\s+\w+\s*\([^)]*?(\w+(?:<[^>]+>)?(?:\s+ornull)?)\s+(\w+)/g,
            ];
            
            for (const pattern of declPatterns) {
                let match;
                pattern.lastIndex = 0;
                while ((match = pattern.exec(line)) !== null) {
                    const type = match[1].replace(/\s+ornull/, ' ornull').trim();
                    const name = match[2];
                    
                    if (['if', 'else', 'for', 'foreach', 'while', 'switch', 'return', 'function', 'local', 'global'].includes(type)) {
                        continue;
                    }
                    
                    variables.push({ name, type, line: lineNum });
                }
            }
        }
        
        return variables;
    }

    /**
     * Find a struct block that ends with a specific variable name
     */
    private findStructBlock(text: string, varName: string): string | null {
        const regex = new RegExp(`struct\\s*\\{([\\s\\S]*?)\\}\\s*${varName}\\b`, 'g');
        const match = regex.exec(text);
        return match ? match[1] : null;
    }

    /**
     * Extract content between braces, handling nested braces
     */
    private extractBraceContent(text: string, startIndex: number): string | null {
        let depth = 1;
        let i = startIndex;
        
        while (i < text.length && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            i++;
        }
        
        if (depth === 0) {
            return text.substring(startIndex, i - 1);
        }
        return null;
    }

    /**
     * Parse struct members from struct body text
     */
    parseStructMembers(body: string): StructMember[] {
        const members: StructMember[] = [];
        const lines = body.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            if (!line || line.startsWith('//') || line.startsWith('#')) {
                continue;
            }
            
            const commentIdx = line.indexOf('//');
            if (commentIdx !== -1) {
                line = line.substring(0, commentIdx).trim();
            }
            
            const member = this.parseMemberLine(line);
            if (member) {
                members.push(member);
            }
        }
        
        return members;
    }

    private parseMemberLine(line: string): StructMember | null {
        line = line.replace(/[,;]\s*$/, '').trim();
        if (!line) return null;
        
        let defaultValue: string | undefined;
        const equalsIdx = line.indexOf('=');
        if (equalsIdx !== -1) {
            defaultValue = line.substring(equalsIdx + 1).trim();
            line = line.substring(0, equalsIdx).trim();
        }
        
        const tokens = this.tokenizeLine(line);
        
        if (tokens.length < 2) {
            if (tokens.length === 1 && /^[a-zA-Z_]\w*$/.test(tokens[0])) {
                return { type: 'var', name: tokens[0], defaultValue };
            }
            return null;
        }
        
        const name = tokens[tokens.length - 1];
        if (!/^[a-zA-Z_]\w*$/.test(name)) {
            return null;
        }
        
        const type = tokens.slice(0, -1).join(' ').trim();
        return { type, name, defaultValue };
    }

    private tokenizeLine(line: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let angleDepth = 0;
        let parenDepth = 0;
        
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            
            if (c === '<') {
                angleDepth++;
                current += c;
            } else if (c === '>') {
                angleDepth--;
                current += c;
            } else if (c === '(') {
                parenDepth++;
                current += c;
            } else if (c === ')') {
                parenDepth--;
                current += c;
            } else if (c === ' ' || c === '\t') {
                if (angleDepth > 0 || parenDepth > 0) {
                    current += c;
                } else {
                    if (current) {
                        tokens.push(current);
                        current = '';
                    }
                }
            } else if (c === '&') {
                current += c;
            } else {
                current += c;
            }
        }
        
        if (current) {
            tokens.push(current);
        }
        
        return tokens;
    }
}

// ============================================================================
// Completion Providers
// ============================================================================

/**
 * Provides completion for struct members (file. and TypedVariable.)
 */
class StructMemberCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | undefined {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        const dotMatch = linePrefix.match(/(\w+)\.$/);
        if (!dotMatch) {
            return undefined;
        }
        
        const varName = dotMatch[1];
        const text = document.getText();
        
        // Check if it's a local struct variable (struct { ... } varName)
        const localStructMembers = this.parser.getLocalStructMembers(text, varName);
        if (localStructMembers && localStructMembers.length > 0) {
            return this.membersToCompletions(localStructMembers, `local struct ${varName}`);
        }
        
        const enums = this.parser.parseEnums(text);
        const allEnums = [...enums];
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel' && doc.uri.toString() !== document.uri.toString()) {
                const docEnums = this.parser.parseEnums(doc.getText());
                allEnums.push(...docEnums.filter(e => e.isGlobal));
            }
        }
        if (allEnums.some(e => e.name === varName)) {
            return undefined;
        }
        
        const directStruct = this.parser.findStructByName(varName);
        if (directStruct) {
            return this.membersToCompletions(directStruct.members, `struct ${varName}`);
        }
        
        const variables = this.parser.parseVariables(text, position.line);
        const variable = variables.find(v => v.name === varName);
        
        if (variable) {
            const baseType = this.extractBaseType(variable.type);
            const struct = this.parser.findStructByName(baseType);
            if (struct) {
                return this.membersToCompletions(struct.members, `${variable.type}`);
            }
        }
        
        return undefined;
    }

    private extractBaseType(type: string): string {
        let base = type.replace(/\s+ornull\s*$/, '').trim();
        const angleIdx = base.indexOf('<');
        if (angleIdx !== -1) {
            base = base.substring(0, angleIdx);
        }
        return base;
    }

    private membersToCompletions(members: StructMember[], source: string): vscode.CompletionItem[] {
        return members.map(member => {
            const item = new vscode.CompletionItem(member.name, this.getCompletionKind(member.type));
            item.detail = member.type;
            item.documentation = new vscode.MarkdownString(`*from ${source}*`);
            if (member.defaultValue) {
                item.documentation = new vscode.MarkdownString(`*from ${source}*\n\n**Default:** \`${member.defaultValue}\``);
            }
            item.sortText = '0' + member.name;
            return item;
        });
    }

    private getCompletionKind(type: string): vscode.CompletionItemKind {
        if (type.includes('function') || type.includes('func')) {
            return vscode.CompletionItemKind.Method;
        }
        if (type.includes('array') || type.includes('table')) {
            return vscode.CompletionItemKind.Variable;
        }
        if (type === 'bool') {
            return vscode.CompletionItemKind.Value;
        }
        return vscode.CompletionItemKind.Field;
    }
}

/**
 * Provides completion for enum values (EnumName.VALUE)
 */
class EnumCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | undefined {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        const dotMatch = linePrefix.match(/(\w+)\.$/);
        if (!dotMatch) {
            return undefined;
        }
        
        const enumName = dotMatch[1];
        const text = document.getText();
        const enums = this.parser.parseEnums(text);
        
        const allEnums = [...enums];
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel' && doc.uri.toString() !== document.uri.toString()) {
                const docEnums = this.parser.parseEnums(doc.getText());
                allEnums.push(...docEnums.filter(e => e.isGlobal));
            }
        }
        
        const targetEnum = allEnums.find(e => e.name === enumName);
        if (!targetEnum) {
            return undefined;
        }
        
        return targetEnum.values.map(value => {
            const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
            item.detail = `${enumName}.${value}`;
            item.sortText = '0' + value;
            return item;
        });
    }
}

/**
 * Provides completion for enum names
 */
class EnumNameCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const text = document.getText();
        const enums = this.parser.parseEnums(text);
        
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'squirrel' && doc.uri.toString() !== document.uri.toString()) {
                const docEnums = this.parser.parseEnums(doc.getText());
                enums.push(...docEnums.filter(e => e.isGlobal));
            }
        }
        
        const seen = new Set<string>();
        const uniqueEnums = enums.filter(e => {
            if (seen.has(e.name)) return false;
            seen.add(e.name);
            return true;
        });
        
        return uniqueEnums.map(enumDef => {
            const item = new vscode.CompletionItem(enumDef.name, vscode.CompletionItemKind.Enum);
            item.detail = enumDef.isGlobal ? 'global enum' : 'enum';
            item.documentation = new vscode.MarkdownString(
                `**Values:** ${enumDef.values.slice(0, 5).join(', ')}${enumDef.values.length > 5 ? '...' : ''}`
            );
            return item;
        });
    }
}

/**
 * Provides completion for global struct types (as type names)
 */
class GlobalStructCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const structs = this.parser.getAllGlobalStructs();
        
        return structs.map(struct => {
            const item = new vscode.CompletionItem(struct.name, vscode.CompletionItemKind.Struct);
            item.detail = 'global struct';
            
            const memberPreview = struct.members.slice(0, 5).map(m => `  ${m.type} ${m.name}`).join('\n');
            item.documentation = new vscode.MarkdownString(
                `\`\`\`squirrel\nglobal struct ${struct.name} {\n${memberPreview}${struct.members.length > 5 ? '\n  ...' : ''}\n}\n\`\`\``
            );
            
            return item;
        });
    }
}

/**
 * Provides completion for global functions parsed from open files
 */
class ScriptGlobalFunctionCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const functions = this.parser.getAllGlobalFunctions();
        
        return functions.map(func => {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `${func.returnType} ${func.name}(${func.params})`;
            item.documentation = new vscode.MarkdownString(`*from ${func.sourceFile}*`);
            
            if (func.params) {
                item.insertText = new vscode.SnippetString(`${func.name}($0)`);
            } else {
                item.insertText = new vscode.SnippetString(`${func.name}()`);
            }
            
            return item;
        });
    }
}

/**
 * Provides completion for global constants and variables parsed from open files
 */
class GlobalConstantCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private parser: SquirrelDocumentParser) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const constants = this.parser.getAllGlobalConstants();
        
        return constants.map(constant => {
            const kind = constant.isConst ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Variable;
            const item = new vscode.CompletionItem(constant.name, kind);
            
            const constStr = constant.isConst ? 'const ' : '';
            item.detail = `global ${constStr}${constant.type} ${constant.name}`;
            
            let docStr = `*from ${constant.sourceFile}*`;
            if (constant.value) {
                // Truncate long values
                const displayValue = constant.value.length > 50 ? constant.value.substring(0, 50) + '...' : constant.value;
                docStr += `\n\n**Value:** \`${displayValue}\``;
            }
            item.documentation = new vscode.MarkdownString(docStr);
            
            return item;
        });
    }
}

/**
 * Provides completion for Squirrel keywords and types
 */
class KeywordCompletionProvider implements vscode.CompletionItemProvider {
    private keywords: vscode.CompletionItem[] = [];

    constructor() {
        const definitions: { words: string[], kind: vscode.CompletionItemKind, detail: string }[] = [
            {
                words: ['if', 'else', 'switch', 'case', 'default', 'break', 'for', 'foreach', 'while', 'do', 'return', 'yield', 'continue', 'try', 'catch', 'throw'],
                kind: vscode.CompletionItemKind.Keyword,
                detail: 'control flow'
            },
            {
                words: ['thread', 'wait', 'waitthread', 'waitthreadsolo'],
                kind: vscode.CompletionItemKind.Keyword,
                detail: 'threading'
            },
            {
                words: ['void', 'int', 'float', 'bool', 'string', 'vector', 'entity', 'asset', 'var', 'array', 'table', 'function', 'functionref', 'ornull'],
                kind: vscode.CompletionItemKind.TypeParameter,
                detail: 'type'
            },
            {
                words: ['global', 'local', 'const', 'static', 'struct', 'enum', 'class', 'extends', 'untyped', 'globalize_all_functions'],
                kind: vscode.CompletionItemKind.Keyword,
                detail: 'modifier'
            },
            {
                words: ['true', 'false', 'null', 'this', 'base', 'constructor', 'in', 'instanceof', 'typeof', 'clone', 'delete', 'expect', 'unreachable'],
                kind: vscode.CompletionItemKind.Keyword,
                detail: 'keyword'
            },
            {
                words: ['#if', '#elseif', '#else', '#endif', '#document'],
                kind: vscode.CompletionItemKind.Keyword,
                detail: 'preprocessor'
            },
            {
                words: ['SERVER', 'CLIENT', 'UI', 'DEV', 'DEVELOPER'],
                kind: vscode.CompletionItemKind.Constant,
                detail: 'platform constant'
            }
        ];

        for (const def of definitions) {
            for (const word of def.words) {
                const item = new vscode.CompletionItem(word, def.kind);
                item.detail = def.detail;
                this.keywords.push(item);
            }
        }
    }

    provideCompletionItems(): vscode.CompletionItem[] {
        return this.keywords;
    }
}

/**
 * Provides completion for common built-in Respawn global functions
 */
class BuiltinFunctionCompletionProvider implements vscode.CompletionItemProvider {
    private functions: vscode.CompletionItem[] = [];

    constructor() {
        const globalFunctions: { name: string, params: string, returns: string, desc: string }[] = [
            // Signals
            { name: 'RegisterSignal', params: 'string signalName', returns: 'void', desc: 'Register a signal' },
            { name: 'Signal', params: 'entity ent, string signalName', returns: 'void', desc: 'Send a signal' },
            { name: 'WaitSignal', params: 'entity ent, string signalName', returns: 'table', desc: 'Wait for a signal' },
            { name: 'EndSignal', params: 'entity ent, string signalName', returns: 'void', desc: 'End thread on signal' },
            
            // Entity validation
            { name: 'IsValid', params: 'entity ent', returns: 'bool', desc: 'Check if entity is valid' },
            { name: 'IsAlive', params: 'entity ent', returns: 'bool', desc: 'Check if entity is alive' },
            { name: 'IsPlayer', params: 'entity ent', returns: 'bool', desc: 'Check if entity is a player' },
            
            // Players
            { name: 'GetPlayerArray', params: '', returns: 'array<entity>', desc: 'Get all players' },
            { name: 'GetPlayerByIndex', params: 'int index', returns: 'entity', desc: 'Get player by index' },
            { name: 'GetLocalClientPlayer', params: '', returns: 'entity', desc: 'Get local player (CLIENT)' },
            { name: 'GetLocalViewPlayer', params: '', returns: 'entity', desc: 'Get view player (CLIENT)' },
            
            // Math
            { name: 'Distance', params: 'vector a, vector b', returns: 'float', desc: 'Distance between points' },
            { name: 'DistanceSqr', params: 'vector a, vector b', returns: 'float', desc: 'Squared distance' },
            { name: 'Length', params: 'vector v', returns: 'float', desc: 'Vector length' },
            { name: 'LengthSqr', params: 'vector v', returns: 'float', desc: 'Squared vector length' },
            { name: 'Normalize', params: 'vector v', returns: 'vector', desc: 'Normalize vector' },
            { name: 'DotProduct', params: 'vector a, vector b', returns: 'float', desc: 'Dot product' },
            { name: 'CrossProduct', params: 'vector a, vector b', returns: 'vector', desc: 'Cross product' },
            { name: 'RandomInt', params: 'int max', returns: 'int', desc: 'Random int [0, max)' },
            { name: 'RandomIntRange', params: 'int min, int max', returns: 'int', desc: 'Random int [min, max]' },
            { name: 'RandomFloat', params: 'float max', returns: 'float', desc: 'Random float [0, max)' },
            { name: 'RandomFloatRange', params: 'float min, float max', returns: 'float', desc: 'Random float [min, max]' },
            { name: 'Clamp', params: 'float val, float min, float max', returns: 'float', desc: 'Clamp value' },
            { name: 'min', params: 'float a, float b', returns: 'float', desc: 'Minimum of two values' },
            { name: 'max', params: 'float a, float b', returns: 'float', desc: 'Maximum of two values' },
            { name: 'fabs', params: 'float v', returns: 'float', desc: 'Absolute value' },
            { name: 'GraphCapped', params: 'float val, float min, float max, float outMin, float outMax', returns: 'float', desc: 'Map value from one range to another (capped)' },
            
            // Angles
            { name: 'AnglesToForward', params: 'vector angles', returns: 'vector', desc: 'Forward vector from angles' },
            { name: 'AnglesToRight', params: 'vector angles', returns: 'vector', desc: 'Right vector from angles' },
            { name: 'AnglesToUp', params: 'vector angles', returns: 'vector', desc: 'Up vector from angles' },
            { name: 'VectorToAngles', params: 'vector v', returns: 'vector', desc: 'Vector to angles' },
            
            // Time
            { name: 'Time', params: '', returns: 'float', desc: 'Current game time' },
            { name: 'WaitFrame', params: '', returns: 'void', desc: 'Wait one frame' },
            
            // Trace
            { name: 'TraceLine', params: 'vector start, vector end, entity ignore, int mask, int group', returns: 'TraceResults', desc: 'Trace a line' },
            
            // Precache
            { name: 'PrecacheModel', params: 'asset model', returns: 'void', desc: 'Precache model' },
            { name: 'PrecacheWeapon', params: 'string weapon', returns: 'void', desc: 'Precache weapon' },
            { name: 'PrecacheParticleSystem', params: 'asset particle', returns: 'void', desc: 'Precache particle' },
            
            // Debug
            { name: 'printt', params: '...', returns: 'void', desc: 'Print (tab separated)' },
            { name: 'printl', params: 'string text', returns: 'void', desc: 'Print line' },
            { name: 'print', params: 'string text', returns: 'void', desc: 'Print' },
            { name: 'Assert', params: 'bool condition, string message = ""', returns: 'void', desc: 'Assert condition' },
            { name: 'Warning', params: 'string message', returns: 'void', desc: 'Print warning' },
            { name: 'CodeWarning', params: 'string message', returns: 'void', desc: 'Code warning' },
            
            // Utility
            { name: 'format', params: 'string fmt, ...', returns: 'string', desc: 'Format string' },
            { name: 'expect', params: 'type, value', returns: 'type', desc: 'Type assertion' },
            { name: 'type', params: 'value', returns: 'string', desc: 'Get type name' },
            { name: 'GetMapName', params: '', returns: 'string', desc: 'Current map name' },
            { name: 'GetGameState', params: '', returns: 'int', desc: 'Current game state' },
            
            // Thread
            { name: 'OnThreadEnd', params: 'void functionref() callback', returns: 'void', desc: 'Thread end callback' },
            { name: 'IsNewThread', params: '', returns: 'bool', desc: 'Is new thread' },
            
            // Entity
            { name: 'CreateEntity', params: 'string className', returns: 'entity', desc: 'Create entity' },
            { name: 'DispatchSpawn', params: 'entity ent', returns: 'void', desc: 'Spawn entity' },
            { name: 'GetEntByIndex', params: 'int index', returns: 'entity', desc: 'Get entity by index' },
            { name: 'GetEntityByScriptName', params: 'string name', returns: 'entity', desc: 'Get entity by script name' },
            
            // Common
            { name: 'AddCallback_OnClientConnected', params: 'void functionref(entity player) callback', returns: 'void', desc: 'Player connected callback' },
            { name: 'AddCallback_OnClientDisconnected', params: 'void functionref(entity player) callback', returns: 'void', desc: 'Player disconnected callback' },
            { name: 'AddCallback_GameStateEnter', params: 'int gameState, void functionref() callback', returns: 'void', desc: 'Game state enter callback' },
        ];

        for (const fn of globalFunctions) {
            const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
            item.detail = `${fn.returns} ${fn.name}(${fn.params})`;
            item.documentation = new vscode.MarkdownString(`*built-in*\n\n${fn.desc}`);
            item.insertText = new vscode.SnippetString(fn.params ? `${fn.name}($0)` : `${fn.name}()`);
            this.functions.push(item);
        }
    }

    provideCompletionItems(): vscode.CompletionItem[] {
        return this.functions;
    }
}
