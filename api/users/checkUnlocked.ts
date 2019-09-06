import cleanBody from './_cleanBody'
import { _handler } from '../../_handler'
import { findOne, update, create, User, findOrgs } from '../../storage'
import { BadRequest } from '../errors'

export const handler = _handler(async event => {
  let parsedBody = JSON.parse(event.body || '{}')

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  const existingUser = await findOne(body.githubId)

  const user: User & {
    validEnterpriseFromOrg: boolean
    validEnterpriseFromOrgAdmin: boolean
    validFromOrg: boolean
    validFromOrgAdmin: boolean
  } = {
    ...(await (existingUser ? update(existingUser, body) : create(body))),
    validEnterpriseFromOrg: false,
    validEnterpriseFromOrgAdmin: false,
    validFromOrg: false,
    validFromOrgAdmin: false,
  }

  // check if a user if part of a valid org
  if (user.orgs && user.orgs.length) {
    const orgs = await findOrgs(user.orgs)

    if (!user.validEnterprise) {
      const org = orgs.find(org => org.validEnterprise)
      user.validEnterprise = !!org
      user.validEnterpriseFromOrg = !!org
      user.validEnterpriseFromOrgAdmin =
        !!org && org.admins.some(id => user.githubId === id)
    }

    if (!user.valid) {
      const org = orgs.find(org => org.valid)
      user.valid = !!org
      user.validFromOrg = !!org
      user.validFromOrgAdmin =
        !!org && org.admins.some(id => user.githubId === id)
    }
  }

  return {
    ok: true,
    user,
  }
})
