const storage = require('../storage')()
const cleanBody = require('./_cleanBody')

module.exports.handler = (event, context, callback) => {
  let parsedBody
  try {
    parsedBody = JSON.parse(event.body || {})
  } catch (e) {
    callback(new Error('[400] Could not parse the body'))
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    callback(new Error('[400] Missing github ID'))
    return
  }

  storage
    .findOne(body.githubId)
    .then(found => {
      if (found) {
        return callback(null, {
          ok: true,
          message: 'Already logged in'
        })
      }
      return storage.create(body).then(() => callback(null, {
        ok: true,
        message: 'Logged in'
      }))
    })
    .catch(callback)
}
