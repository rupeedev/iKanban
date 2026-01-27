# Console to Document

Copy the console summary from the previous message verbatim to the specified file.

## Rules

1. Copy EXACTLY as-is from console output
2. Do NOT add headers, sections, or formatting
3. Do NOT paraphrase or reformat tables
4. Do NOT add implementation details
5. Do NOT add extra information
6. Preserve original markdown formatting

## Usage

```
/console-to-doc <file-path>
```

## Arguments

- `$ARGUMENTS` = target file path

## Execution

1. Identify the console summary in the previous message
2. Copy it verbatim to: $ARGUMENTS
3. Confirm with: "Copied console summary to <file>"
