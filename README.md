# 根据mysql表结构自动生成graphql schema
> 用于快速生成表的增删改查接口，减少接口封装，让前端尽量摆脱对后端的依赖，即相当于前端直接操作数据库，对安全性要求不高的内部运营系统可以考虑使用

# 依赖项
async 异步操作工具库
mkdirp 创建目录
loadsh 工具库
graceful-fs-extra 文件读写工具库
sequelize ORM工具，用于操作mysql

# 实现原理
- 1、show tables 获取所有表名
- 2、desc xxxx 获取表结构
- 3、根据表结构和字段类型，生成对应的Graphql Type
- 4、生成增删改查对应的resolver，包括get_xxx_ById(根据id查询)、get_self_xxx_ById(根据id和数据所属人查询)、get_xxx_List(查询所有数据)、get_self_xxx_List(根据数据所属人查询所有数据)、add_xxx(新增数据)、delete_xxx_ById(根据id删除数据)、delete_self_xxx_ById(根据id和数据所属人删除数据)、modify_xxx_ById(根据id修改数据)、modify_self_xxx_ById(根据id和数据所属人修改数据)、search_xxx(搜索数据)、search_self_xxx(根据数据所属人搜索数据)
备注：xxx是指表名
- 5、生成js文件

# 其他
只生成了简单的增删改查方法，已经可以适应大部分的需求，对于单个接口需进行多表操作的，还是老老实实写接口吧