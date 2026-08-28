#!/bin/bash
find /var/log -mindepth 1 -delete
find /ursim -maxdepth 1 -type f -name '*.log' -delete
