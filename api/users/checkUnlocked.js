const storage = require('../../storage')()
const cleanBody = require('./_cleanBody')
const makeCallback = require('../_makeCallback')

module.exports.handler = (event, context, callback) => {
  let parsedBody
  try {
    parsedBody = JSON.parse(event.body || '{}') || {}
  } catch (e) {
    makeCallback(callback, 'Could not parse the body', 400)
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    makeCallback(callback, 'Missing github ID', 400)
    return
  }

  storage
    .findOne(body.githubId)
    .then(found => {
      if (found) {
        return storage.update(found).then(() => found)
      }
      return storage.create(body).then(() => body)
    })
    .then((user) => {
      if (!user.valid && !user.validEnterprise && user.orgs && user.orgs.length) {
        // check if a user if part of a valid org
        return storage.findOrgs(user.orgs).then(orgs => {
          user.validEnterprise = orgs.some(org => org.validEnterprise)
          user.valid = !user.validEnterprise && orgs.some(org => org.valid)
        }).then(() => {
          makeCallback(callback, {
            ok: true,
            user: user
          })
        })
      } else {
        makeCallback(callback, {
          ok: true,
          user: user
        })
      }
    })
    .catch(callback)
}
