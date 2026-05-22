function responseFormatter(request, response, next) {
  const originalJson = response.json.bind(response);

  response.json = function (body) {
    // Already formatted or error response
    if (body && typeof body.code !== 'undefined' && typeof body.message === 'string') {
      return originalJson(body);
    }

    // Wrap non-standard responses
    if (response.statusCode >= 200 && response.statusCode < 300) {
      const wrapped = { code: 0, message: '操作成功', data: body };
      return originalJson(wrapped);
    }

    return originalJson(body);
  };

  next();
}

module.exports = { responseFormatter };
