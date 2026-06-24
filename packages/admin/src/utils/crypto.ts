import md5Lib from 'md5';

/** 对字符串做 MD5 摘要，用于密码传输加密 */
export function md5(input: string): string {
  return md5Lib(input);
}
