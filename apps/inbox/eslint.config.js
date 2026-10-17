import { intentlock } from "@intentlock/config/eslint";

export default intentlock("inbox", {
  files: ["src/**/*.tsx"],
  rules: {
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
  },
});
