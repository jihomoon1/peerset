// One structured JSON line per event (blueprint §14). Never pass headers, the
// User-Agent or personal data in here.

export type LogFields = Record<string, string | number | boolean | null>;
export type Logger = (event: string, fields: LogFields) => void;

export const log: Logger = (event, fields) => {
  console.log(JSON.stringify({ event, ...fields }));
};
