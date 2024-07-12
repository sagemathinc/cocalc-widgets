# Custom Widget Manager implementation for CoCalc

This is a Jupyter widget manager that loads widgets from a CDN, and is relatively
easy to use in another web application.

**ACKNOWLEDGEMENT:** This is based on the [Custom Widget Manager for Google Colab](https://github.com/googlecolab/colab-cdn-widget-manager).

## Development

Install and build:

```sh
pnpm install
```

## Tests

There is testing code from colab-cdn-widget-manager, but it does not work for me. It uses headless chromium, etc., but it's pretty broken by things changing. I'll likely delete it all, and instead test another way.
