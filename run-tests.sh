#!/bin/bash
# Wrapper script to run tests with proper memory limits for forked processes

# Run vitest with explicit node memory flag
# The --max-old-space-size flag is passed to the main process
# and execArgv in vitest.config.ts passes it to worker processes
exec node --max-old-space-size=8192 ./node_modules/.bin/vitest --run "$@"
