import { _handler } from '../../_handler'
import { findOne, findOneByName } from '../../storage'
import { NotFound } from '../errors'

export const handler = _handler(async event => {
  if (event.queryStringParameters.githubId) {
    const user = await findOne(event.queryStringParameters.githubId)
    if (!user) {
      throw new NotFound('Not found')
    }
    return {
      ok: true,
      user: {
        githubId: user.githubId,
        login: user.login,
      },
    }
  } else if (event.queryStringParameters.githubUsername) {
    const user = await findOneByName(event.queryStringParameters.githubUsername)
    if (!user) {
      throw new NotFound('Not found')
    }
    return {
      ok: true,
      user: {
        githubId: user.githubId,
        login: user.login,
      },
    }
  } else {
    throw new NotFound('Not found')
  }
})
