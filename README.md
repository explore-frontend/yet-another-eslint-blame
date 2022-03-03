# yet-another-eslint-blame

Yet another eslint blame (might) with better adaptability.  
The input is eslint's output with json format (You can see it [here](https://eslint.org/docs/user-guide/formatters/#json)).
And it's will run git blame for each eslint report. 

## Install 

```
pnpm install yet-another-eslint-blame
```

## Usage

### Before all

**We have to `cd` into the repo's directory to read git histories.**

### Read eslint json output from file

1. Run `eslint` and output with json:
    eg: Run `eslint src -f json -o ./a.json`
2. run `yet-another-eslint-blame`:
    eg: Run `yaeb ./a.json`
3. Enjoy!

### Read eslint json output with stdin

1. Run `eslint` and output with json, and pipe into `yet-another-eslint-blame`:
    eg: Run `eslint src -f json | yaeb`
2. Enjoy!

### Output with markdown todo list

With `-f markdown`, we will output something like:

```markdown
- [] [<file and line number with the relative path>](./<file and line number with the relative path>) @<author>
```

It will looks like:

- [ ] [package.json#L2](./package.json#L2) @kingwl

You can just copy it into gitlab's merge requests or issues.

## Options

| name               | type             | default | description                          |
|--------------------|------------------|---------|--------------------------------------|
| `--format` or `-f`     | `json` or `markdown` | `json`    | Generate json or markdown todo list. |
| `--output` or `-o`     | `string`           |         | Specify output into a file.          |
| `--warn` or  `-w`      | `boolean`          | `false`   | Includes warning message.            |
| `--suppressed` or `-s` | `boolean`          | `false`   | Includes suppressed message.         |
| `--rule` or `-r` | `string`          |      | Specify a rule Id.         |
| `--groupby` or `-g` | `rule`          | `rule` | Specify group by what.         |

