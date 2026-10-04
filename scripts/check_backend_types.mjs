import ts from 'typescript';
const path='backend/tsconfig.json';
const file=ts.readConfigFile(path,ts.sys.readFile);
if(file.error)throw new Error(ts.flattenDiagnosticMessageText(file.error.messageText,'\n'));
// Production files stay within rootDir; Vitest owns the separate tests.
const config=ts.parseJsonConfigFileContent({...file.config,include:['src/**/*.ts']},ts.sys,'backend');
const program=ts.createProgram(config.fileNames,{...config.options,noEmit:true});
const diagnostics=[...config.errors,...ts.getPreEmitDiagnostics(program)];
if(diagnostics.length){
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:path=>path,getNewLine:()=> '\n'}));
  process.exitCode=1;
}else process.stdout.write('Backend production TypeScript passed.\n');
