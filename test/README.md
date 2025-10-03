# Testing Overview

## Main test cases 

In the `cases` directory, we have all the actual test functions for core functionality or tools.
Cases are plain functions that are then passed to any `runTests` call.
`run-all-cases.js` simply strings all the exported function arrays from the `cases` directory modules

## Core

In `tests/core`, similar to `src/core` this is the core functionality that drives the custom test runner.
It has assertion functions, error objects, helpers, and the runner itself.

## Services

In `tests/services`, there is a bootstrap script that runs the built-in services.
This can be copied and modified for any number of specific integration tests using the registry.
It uses port 11000 by default, to prevent issues with more typical test/dev ports.
This is being used to expedite CLI tests so they can be included in core/cases.

## CLI

Sort of a placeholder for future tests and new functionality. The features and tests are incomplete, so no use creating a `cases` test module.

# Creating Custom Service Tests

See `example-tests.js` for explanations of core test functions
