#!/usr/bin/env bash
## Print usage details of a command.
dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
url="https://github.com/nodef/extra-npm/issues"

fil="$dir/../man/$1.txt"
if   [[ "$1" == "" ]]; then less "$dir/../man/help.txt"
elif [ -f "$fil" ];    then less "$fil"
else echo "No help found for '$1'. You can report this at ${url}"; fi