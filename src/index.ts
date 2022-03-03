import type * as eslint from 'eslint';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import getStdin from 'get-stdin';
import * as fs from 'fs';
import * as path from 'path';
import { blameLine } from 'git-blame-line';

type ExtraLintResult = eslint.ESLint.LintResult & {
    suppressedMessages?: eslint.Linter.LintMessage[];
};

export enum OutputFormat {
    Json = 'json',
    Markdown = 'markdown'
}

export enum GroupBy {
    RuleId = 'rule'
}

export enum Severity {
    Off = 0,
    Warn = 1,
    Error = 2
}

export interface BlameInfo {
    filePath: string;
    line: number;
    author: string;
    email: string;
    ruleId: string | null;
    message: string;
    isWarning: boolean;
    isSuppressed: boolean;
    time: string;
}

export type GroupByBlameInfo = Record<string, BlameInfo[]>;

export interface Args {
    format?: OutputFormat;
    warn?: boolean;
    input?: string;
    output?: string;
    suppressed?: boolean;
    rule?: string;
    groupby?: GroupBy;
}

function isDef<T>(v: T): v is NonNullable<T> {
    return v !== undefined && v !== null;
}

function assertDef<T>(v: T, message?: string): asserts v is NonNullable<T> {
    if (!isDef(v)) {
        throw new Error(message ?? 'Must be defined');
    }
}

function assert(v: unknown, message?: string): asserts v {
    if (!v) {
        throw new Error(message ?? 'Assert failed');
    }
}

function assertNever(value: unknown, message?: string): never {
    throw new Error(message ?? 'Should never reach');
}

function fsFilePathWithLineFactory(fsFilePath: string, line: number) {
    return `${fsFilePath}:${line}`;
}

function writeTodoListStatus(done: boolean) {
    return done ? 'x' : ' ';
}

function writeTodoList(...items: string[]) {
    return items.join('\n');
}

function writeTodoListItem(status: boolean, content: string) {
    return `- [${writeTodoListStatus(status)}] ${content}`;
}

function writeLink(text: string, link: string) {
    return `[${text}](${link})`;
}

function writeAt(name: string) {
    return `@${name}`;
}

function writeFilePathAndLine(filePath: string, line: number) {
    return `${filePath}#L${line}`;
}

function writeRelativePath(path: string) {
    return `./${path}`;
}

function writeContent(...contents: string[]) {
    return contents.join(' ');
}

function writeFile(...contents: string[]) {
    return contents.join('\n');
}

function writeH4(title: string) {
    return `#### ${title} ####`;
}

function markdownFormatter(infos: BlameInfo[]) {
    return writeTodoList(
        ...infos.map(info => {
            return writeTodoListItem(
                false,
                writeContent(
                    writeLink(
                        writeFilePathAndLine(info.filePath, info.line),
                        writeRelativePath(
                            writeFilePathAndLine(info.filePath, info.line)
                        )
                    ),
                    writeAt(info.author)
                )
            );
        })
    );
}

function groupByMarkdownFormatter(infos: GroupByBlameInfo): string {
    return writeFile(
        ...Object.entries(infos)
            .map(([key, value]) => {
                return [writeH4(key), markdownFormatter(value)];
            })
            .flat()
    );
}

function jsonFormatter(infos: BlameInfo[]): string {
    return JSON.stringify(infos);
}

function groupByJsonFormatter(infos: GroupByBlameInfo): string {
    return JSON.stringify(infos);
}

function groupByInfo(groupBy: GroupBy, infos: BlameInfo[]): GroupByBlameInfo {
    if (groupBy === GroupBy.RuleId) {
        const resutls: GroupByBlameInfo = {};
        infos.forEach(info => {
            const ruleId = info.ruleId ?? 'Unknown Rule';
            const list = resutls[ruleId] ?? [];
            list.push(info);
            resutls[ruleId] = list;
        });
        return resutls;
    }
    assertNever(groupBy);
}

export async function blame(
    content: string,
    argv: Omit<Args, 'input' | 'output'>
) {
    const results = JSON.parse(content) as ExtraLintResult[];
    const format = argv.format ?? OutputFormat.Json;
    const includesWarn = argv.warn ?? false;
    const includesSuppressed = argv.suppressed ?? false;
    const rule = argv.rule;
    const groupBy = argv.groupby;

    const infos: BlameInfo[] = [];
    for (const result of results) {
        const fsFilePath = result.filePath;

        for (const message of result.messages) {
            await messageWorker(message, fsFilePath, false);
        }

        if (includesSuppressed && result.suppressedMessages) {
            for (const message of result.suppressedMessages) {
                await messageWorker(message, fsFilePath, true);
            }
        }
    }

    if (groupBy) {
        const results = groupByInfo(groupBy, infos);
        if (format === OutputFormat.Json) {
            return groupByJsonFormatter(results);
        }

        assert(format === OutputFormat.Markdown);
        return groupByMarkdownFormatter(results);
    } else {
        if (format === OutputFormat.Json) {
            return jsonFormatter(infos);
        }

        assert(format === OutputFormat.Markdown);
        return markdownFormatter(infos);
    }

    async function messageWorker(
        message: eslint.Linter.LintMessage,
        fsFilePath: string,
        isSuppressed: boolean
    ) {
        if (
            message.severity !== Severity.Error &&
            !(includesWarn && message.severity === Severity.Warn)
        ) {
            return;
        }
        if (isDef(rule) && message.ruleId !== rule) {
            return;
        }

        const fsFilePathWithLine = fsFilePathWithLineFactory(
            fsFilePath,
            message.line
        );
        const blameResult = await blameLine(fsFilePathWithLine);

        infos.push({
            line: message.line,
            filePath: blameResult.filename,
            author: blameResult.author,
            email: blameResult.authorMail,
            time: blameResult.authorTime.toString(),
            ruleId: message.ruleId,
            isWarning: message.severity === Severity.Warn,
            message: message.message,
            isSuppressed
        });
    }
}

function handlerFactory(data?: string) {
    return async function handler(argv: yargs.Arguments<Args>) {
        const content = await getData();
        const result = await blame(content, argv);
        if (argv.output) {
            const dirname = path.dirname(argv.output);
            if (!fs.existsSync(dirname)) {
                await fs.promises.mkdir(dirname, { recursive: true });
            }

            await fs.promises.writeFile(argv.output, result);
        } else {
            console.log(result);
        }

        async function getData() {
            if (isDef(data)) {
                return data;
            }
            const input = argv.input;
            assertDef(input);

            const buffer = await fs.promises.readFile(input);
            return buffer.toString();
        }
    };
}

export async function main() {
    const data = await getStdin();
    const isReadData = !!data.length;
    const inputArg = !isReadData ? '<input>' : undefined;

    yargs(hideBin(process.argv))
        .strict()
        .command<Args>({
            command: ['$0', inputArg, '[options]'].filter(isDef).join(' '),
            describe: 'Blame everyone from eslint json output.',
            builder: (yargs: yargs.Argv<Args>) => {
                if (isReadData) {
                    return yargs;
                }

                return yargs
                    .positional('input', {
                        describe: 'input file path',
                        type: 'string',
                        normalize: true
                    })
                    .epilog('Happy hack');
            },
            handler: handlerFactory(isReadData ? data : undefined)
        })
        .option('f', {
            alias: 'format',
            describe: 'Output format',
            type: 'string',
            choices: [OutputFormat.Json, OutputFormat.Markdown]
        })
        .option('o', {
            alias: 'output',
            describe: 'Output file path',
            type: 'string',
            normalize: true
        })
        .option('w', {
            alias: 'warn',
            describe: 'Includes warn message',
            type: 'boolean'
        })
        .option('s', {
            alias: 'suppressed',
            describe: 'Includes suppressed message',
            type: 'boolean'
        })
        .option('r', {
            alias: 'rule',
            describe: 'Specify a rule id',
            type: 'string'
        })
        .option('g', {
            alias: 'groupby',
            describe: 'Group results by',
            type: 'string',
            choices: [GroupBy.RuleId],
            default: GroupBy.RuleId
        })
        .version()
        .alias('v', 'version')
        .showHelpOnFail(true, 'Specify --help for available options')
        .help('h')
        .alias('h', 'help').argv;
}
