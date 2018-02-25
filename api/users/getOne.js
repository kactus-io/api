const storage = require('../../storage')()
const makeCallback = require('../_makeCallback')

module.exports.handler = (event, context, callback) => {
  if (event.queryStringParameters.githubId) {
    storage
    .findOne(event.queryStringParameters.githubId)
    .then(item => {
      if (!item) {
        makeCallback(callback, 'Not found', 404)
        return
      }
      makeCallback(callback, {
        ok: true,
        user: {
          githubId: item.githubId,
          login: item.login
        }
      })
    })
    .catch(callback)
  } else if (event.queryStringParameters.githubUsername) {
    storage
    .findOneByName(event.queryStringParameters.githubUsername)
    .then(item => {
      if (!item) {
        makeCallback(callback, 'Not found', 404)
        return
      }
      makeCallback(callback, {
        ok: true,
        user: {
          githubId: item.githubId,
          login: item.login
        }
      })
    })
    .catch(callback)
  } else {
    makeCallback(callback, 'Not found', 404)
  }
}
