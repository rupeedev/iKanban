Create or update iKanban task.

Usage: /task create "title" OR /task done IKA-27

Commands:
- Create: python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "$ARGUMENTS" -s inprogress
- Done: python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update $ARGUMENTS --status done
- List: python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py issues IKA

Parse $ARGUMENTS to determine action.
