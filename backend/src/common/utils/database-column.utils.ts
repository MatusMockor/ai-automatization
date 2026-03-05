export const getTimestampColumnType = (): 'datetime' | 'timestamptz' => {
  return process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
};

export const getJsonObjectColumnType = (): 'simple-json' | 'jsonb' => {
  return process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb';
};
