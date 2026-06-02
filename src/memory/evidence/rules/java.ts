import { hasSecurityEvidence, isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const javaEvidenceRules: EvidenceRule[] = [
  {
    id: "spring-module-boundaries",
    layer: "L1",
    category: "Architecture",
    summary: "后端按 Maven/Gradle 多模块和业务域分层组织代码。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /pom\.xml$|build\.gradle$/.test(f.path) &&
      /<module>|plugins\s*\{|dependencies\s*\{/.test(f.content),
  },
  {
    id: "spring-controller-contract",
    layer: "L2",
    category: "API",
    summary: "后端对外接口通过 Controller/API 层暴露，并使用注解声明路由和参数契约。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /\.java$/.test(f.path) &&
      /@(RestController|Controller|RequestMapping|GetMapping|PostMapping)|interface\s+\w+Api\b/.test(
        f.content,
      ),
  },
  {
    id: "java-dto-vo-do-naming",
    layer: "L3",
    category: "Naming",
    summary: "Java 数据契约采用 DTO/VO/DO/Mapper/Service 等后缀表达职责边界。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /\.java$/.test(f.path) &&
      /\b(class|interface|enum)\s+\w+(DTO|ReqVO|RespVO|VO|DO|Mapper|Service|Api|Enum)\b/.test(
        f.content,
      ),
  },
  {
    id: "lombok-models",
    layer: "L3",
    category: "Typing",
    summary: "Java 模型类使用 Lombok 注解减少样板代码。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /\.java$/.test(f.path) &&
      /@(Data|Getter|Setter|Builder|AllArgsConstructor|NoArgsConstructor)/.test(
        f.content,
      ),
  },
  {
    id: "mapper-persistence",
    layer: "L5",
    category: "Persistence",
    summary: "持久化访问通过 Mapper/ORM 抽象集中处理。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      (/Mapper\.java$/.test(f.path) ||
        /BaseMapper|@Mapper|@TableName|JpaRepository|CrudRepository/.test(
          f.content,
        )) &&
      /\.(java|xml)$/.test(f.path),
  },
  {
    id: "validation-security",
    layer: "L7",
    category: "Security",
    summary: "输入校验、认证授权或安全过滤通过框架注解/统一入口处理。",
    appliesTo: ["java", "spring-boot", "mixed"],
    test: (f) => isProductionFile(f) && hasSecurityEvidence(f),
  },
];
