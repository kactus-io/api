import * as qs from 'querystring'
import fetch from 'node-fetch'
import { findOne, findOrgs, User, create } from '../storage'
import { _handler } from '../_handler'
import { BadRequest } from './errors'

async function authenticate(
  code: String
): Promise<{
  access_token: string
  token_type: 'bearer'
  scope: string
}> {
  const res = await fetch(
    `https://github.com/login/oauth/access_token?${qs.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    })}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  const data = await res.json()

  if (!res.ok) {
    const error = new BadRequest(data.message)
    error.status = res.status
    throw error
  }

  return data
}

async function getEmail(access_token: string, scopes: string[], user: any) {
  // sometime the email is nested or not. It's weird.
  let email: string = (user.email && user.email.email) || user.email

  // let's check if we have access to the private emails of the user
  if (scopes.some(s => s === 'user:email')) {
    const privateEmailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: 'Token ' + access_token,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (privateEmailsRes.ok) {
      const privateEmails: {
        email: string
        verified: boolean
        primary: boolean
        visibility: 'public' | 'private'
      }[] = await privateEmailsRes.json()

      email = privateEmails.find(e => e.primary).email
    }
  }

  return email
}

export const handler = _handler(async event => {
  const { access_token, scope } = await authenticate(
    event.queryStringParameters.code
  )

  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: 'Token ' + access_token,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  const data = await res.json()

  if (!res.ok) {
    const error = new BadRequest(data.message)
    error.status = res.status
    throw error
  }

  const githubId = String(data.id)
  const existingUser = await findOne(githubId)

  const user: User & {
    validEnterpriseFromOrg: boolean
    validEnterpriseFromOrgAdmin: boolean
    validFromOrg: boolean
    validFromOrgAdmin: boolean
  } = {
    ...(await (existingUser
      ? existingUser
      : create({
          githubId: githubId,
          email: await getEmail(access_token, scope.split(', '), data),
          login: data.login,
        }))),
    validEnterpriseFromOrg: false,
    validEnterpriseFromOrgAdmin: false,
    validFromOrg: false,
    validFromOrgAdmin: false,
  }

  const orgs = await findOrgs(user.orgs)

  // check if a user if part of a valid org
  if (orgs && orgs.length) {
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
    user: {
      ...user,
      orgs,
    },
    token: access_token,
  }
})
