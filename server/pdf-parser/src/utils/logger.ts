import tracer from "tracer";

/**
 * Logger
 * @type {tracer.Tracer.Logger}
 * @example
 * logger.trace('Hello');
 * logger.debug('Hello');
 * @see https://www.npmjs.com/package/tracer
 */
export const logger = tracer.colorConsole({
  format: "[{{timestamp}}] [{{title}}] {{message}} (in {{file}}:{{line}})",
  dateformat: "yyyy-dd-mm HH:MM:ss",
  preprocess: function (data) {
    data.title = data.title.toUpperCase();
  },
});
