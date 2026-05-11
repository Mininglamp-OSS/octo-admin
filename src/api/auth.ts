// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import api from './index'

interface LoginParams {
  username: string
  password: string
}

interface LoginResponse {
  token: string
  name: string
  role: string
}

export const login = (params: LoginParams) =>
  api.post<LoginResponse>('/v1/manager/login', params).then((res) => res.data)
