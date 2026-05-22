function formatSuccess(data, message = '操作成功') {
  return { code: 0, message, data };
}

function formatError(code, message, httpStatus = 400) {
  return { code, message, httpStatus };
}

module.exports = { formatSuccess, formatError };
