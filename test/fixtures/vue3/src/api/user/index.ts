import request from "@/config/axios";

export interface UserVO {
  id: number;
  name: string;
}

export const getUser = (id: number) => request.get<UserVO>(`/users/${id}`);
