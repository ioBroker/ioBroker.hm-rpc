#!/bin/bash
#
# This minor helper script will take the current webui.js and try to
# extract the device IDs and corresponding image filename so that the
# images.js file can be automatically created.
#
# Example usage:
# ./create-images-js.sh /www/webui/webui.js >images.js
#

WEBUIJS_PATH=${1}

IFS=$'\n'
declare -a DEVICES=($(grep "devices/50/" ${WEBUIJS_PATH} | cut -d\" -f2))
declare -a PATHS=($(grep "devices/50/" ${WEBUIJS_PATH} | cut -d\" -f6))
declare -A DEVARRAY
unset IFS

i=0
for e in "${DEVICES[@]}"; do
  if [ -n "${PATHS[i]}" ]; then
    DEVARRAY["$e"]="$(basename ${PATHS[i]})";
  fi
  ((i++))
done

echo "module.exports =  {"
i=0
for e in "${!DEVARRAY[@]}"; do
  if [ ${i} -gt 0 ]; then
    echo ","
  fi
  echo -n "    '$e': '${DEVARRAY[$e]}'"
  ((i++))
done
echo
echo "};"
