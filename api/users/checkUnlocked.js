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
      if (user.orgs && user.orgs.length) {
        // check if a user if part of a valid org
        return storage.findOrgs(user.orgs).then(orgs => {
          if (!user.validEnterprise) {
            const org = orgs.find(org => org.validEnterprise)
            user.validEnterprise = !!org
            user.validEnterpriseFromOrg = !!org
            user.validEnterpriseFromOrgAdmin = org.admins.some(id => user.githubId === id)
          }
          if (!user.valid) {
            const org = orgs.find(org => org.valid)
            user.valid = !!org
            user.validFromOrg = !!org
            user.validFromOrgAdmin = org.admins.some(id => user.githubId === id)
          }
          return user
        })
      }
      return user
    }).then(user => makeCallback(callback, {
      ok: true,
      user: user
    }))
    .catch(callback)
}
