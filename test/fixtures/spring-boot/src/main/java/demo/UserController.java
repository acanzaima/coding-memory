package demo;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class UserController {
  @GetMapping("/users")
  UserRespVO get(@Valid UserReqVO req) {
    return new UserRespVO();
  }
}
