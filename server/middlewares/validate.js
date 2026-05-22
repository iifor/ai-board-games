const { AppError, ErrorCodes } = require('../utils/errors');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const result = schema.safeParse(data);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `参数校验失败：${messages}`, 400);
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
