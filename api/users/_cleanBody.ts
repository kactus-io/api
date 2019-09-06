export default function cleanBody(body: any = {}) {
  const res: {
    githubId: string
    enterprise: boolean
    email: string
    login: string
  } = {
    githubId: '' + body.githubId,
    enterprise: !!body.enterprise,
    email: body.email ? body.email.email : body.email,
    login: body.login,
  }

  return res
}
