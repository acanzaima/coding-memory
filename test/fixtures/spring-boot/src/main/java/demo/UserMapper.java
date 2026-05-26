package demo;

import org.apache.ibatis.annotations.Mapper;

@Mapper
interface UserMapper {
  UserDO selectById(Long id);
}
