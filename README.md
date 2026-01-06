# @lsagetlethias/airtable-blocks-vite-bundler

`airtable-blocks-vite-bundler` is a small TypeScript library that provides a programmatic wrapper around Vite (v7) for building Airtable Blocks and similar third-party blocks.

See https://github.com/Airtable/blocks.

## Installation

Use the package manager `npm` or `yarn` (or whatever) to install the package:

```bash
npm install --save-dev @lsagetlethias/airtable-blocks-vite-bundler
# or
yarn add --dev @lsagetlethias/airtable-blocks-vite-bundler
```

## Usage

- Create a file named `bundler.js` inside your app project folder with the following contents:

```js
const createBundler = require('@lsagetlethias/airtable-blocks-vite-bundler').default;

function createConfig(baseConfig) {
    // Add any desired customizations here
    return baseConfig;
}

exports.default = () => {
    return createBundler(createConfig);
};
```

-   Inside your `block.json` file, add a "bundler" field, with a "module" field inside that points
    to your bundler file.

```diff
{
    "version": "1.0",
-   "frontendEntry": "./frontend/index.js"
+   "frontendEntry": "./frontend/index.js",
+   "bundler": {
+       "module": "./bundler.js"
+   }
}
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update or add tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)

