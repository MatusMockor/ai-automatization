export const getTimestampColumnType = (): 'datetime' | 'timestamptz' => {
  return process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
};
