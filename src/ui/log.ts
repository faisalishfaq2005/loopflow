import pc from "picocolors";

export const log = {
  header(text: string): void {
    console.log(`\n${pc.bold(pc.cyan(text))}`);
  },
  info(text: string): void {
    console.log(text);
  },
  dim(text: string): void {
    console.log(pc.dim(text));
  },
  success(text: string): void {
    console.log(pc.green(text));
  },
  warn(text: string): void {
    console.warn(pc.yellow(text));
  },
  error(text: string): void {
    console.error(pc.red(text));
  },
};
