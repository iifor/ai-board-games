const { Router } = require('express');
const service = require('./service');
const utils = require('./utils');
const constants = require('./constants');
const { formatSuccess } = require('../../utils/response');

const router = Router();

router.post('/uploads/image', (request, response, next) => {
  try {
    const result = service.saveUploadedImage(request.body);
    response.json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
});

module.exports = { ...service, ...utils, ...constants, router };
