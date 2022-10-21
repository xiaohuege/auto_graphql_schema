#!/usr/bin/env node

/**
 * 自动生成Graphql Schema
 * 仅限于开发环境使用
 */
process.env.NODE_ENV = 'development'

const Sequelize = require('sequelize')
const _ = require('loadsh')
const asyncUtil = require('async')
const mkdirp = require('mkdirp')
const path = require('path')
const fs = require('graceful-fs-extra');

function AutoSchema(database, username, password, options) {
  if (options && options.dialect != 'mysql') {
    throw new Error("supported dialect: mysql")
  }
  if (database instanceof Sequelize) {
    this.sequelize = database;
  } else {
    this.sequelize = new Sequelize(database, username, password, options || {})
  }

  this.queryInterface = this.sequelize.getQueryInterface();
  this.tables = {};

  this.options = _.extend({
    autoSequelizeQuery: true,
    autoSequelizeMutation: true,
    outpath: './schemas',
    camelCaseForFileName: false,
    indentation: '\t',
    formatTableName: function(tableName) {
      return tableName
    },
    // 表公共字段，根据需求调整
    commonFields: ['created_time', 'modified_time','created_user','modified_user','enabled'],
    // 描述数据所属人的字段
    selfKey: 'created_user'
  }, options || {});
}

AutoSchema.prototype.run = function(callback) {
  var self = this
  this.queryInterface.showAllTables().then(getAllTables,callback);
  function getAllTables(tables) {
    asyncUtil.each(tables, function(table, cb) {
      self.queryInterface.describeTable(table, self.options.schema).then(function(fields){
        self.tables[table] = fields
        cb()
      },cb)
    }, function(err) {
      var res = {}
      _.each(self.tables, function(fields, table) {
        var isView = table.indexOf('v_') === 0
        var tableName = _.isFunction(self.options.formatTableName) ? self.options.formatTableName(table) : table
        if (tableName === false) return
        var typeName = tableName + 'Type'
        var primaryIds = []
        var indent = self.options.indentation
        var text  = '/*auto schema created at:' + new Date().toLocaleDateString() + '*/\n\n'
        text += 'const {GraphQLObjectType,GraphQLString,GraphQLID,GraphQLList,GraphQLNonNull,GraphQLInt,GraphQLFloat,GraphQLBoolean} = require("graphql")\n\n'
        text += "function parseValue(param){let str = param;if(typeof str === 'undefined'){return false;}str += '';let op='=';let val='';let arr=str.split(':');if(arr.length==1){op='=';val=arr[0];}else if(arr[0]==''){op='=';val=(arr.splice(0,1),arr.join(':'));}else{op=arr[0];val=(arr.splice(0,1),arr.join(':'));}if(val === undefined) return false;return [op,val];}\n"
        text += 'const originalName = "' + table + '"\n\n'
        text += 'const name = "' + typeName + '"\n\n'
        text += 'const ' + typeName + ' = new GraphQLObjectType({\n'
        text += indent + 'name:"' + _.upperFirst(tableName) + '",\n'
        text += indent + 'fields:{\n'
        var fieldTypeMap = {}
        var fieldPrimaryMap = {}
        var fieldDescriptionMap = {}
        _.each(fields, function(desc,field) {
          var description = desc.comment || ''
          //type=INT(11)
          var type = desc.type.split('(')[0]
          var primaryKey = desc.primaryKey || false
          var graphqlType = 'GraphQLString'
          var idDesc = null
          if (primaryKey) {
            graphqlType = 'GraphQLID'
            idDesc = {
              key: field,
              value: description,
              isInt: false
            }
          } else if (type == 'INT' || type == 'TINYINT' || type == 'SMALLINT' || type == 'MEDIUMINT' || type == 'BIGINT') {
            graphqlType = 'GraphQLInt'
            if (idDesc) {
              idDesc.isInt = true
            }
          } else if (type == 'FLOAT' || type == 'DOUBLE') {
            graphqlType = 'GraphQLFloat'
          }
          text += indent + indent  + field + ': {\n'
          text += indent + indent  + indent + 'type: ' + graphqlType + ',\n'
          text += indent + indent  + indent + 'description: "' + description + '",\n'
          text += indent + indent + '},\n'

          idDesc && primaryIds.push(idDesc)
          idDesc && (fieldPrimaryMap[field] = true)
          fieldTypeMap[field] = graphqlType
          fieldDescriptionMap[field] = description
        })
        text += indent + '}\n'
        text += '})\n\n'
        //resolver names
        const resolverFindOne = _.camelCase(`get_${tableName}_ById`)
        const resolverFindSelfOne = _.camelCase(`get_self_${tableName}_ById`)
        const resolverFindAll = _.camelCase(`get_${tableName}_List`)
        const resolverFindSelfAll = _.camelCase(`get_self_${tableName}_List`)
        const resolverAddOne = _.camelCase(`add_${tableName}_`)
        const resolverDeleteOne = _.camelCase(`delete_${tableName}_ById`)
        const resolverDeleteSelfOne = _.camelCase(`delete_self_${tableName}_ById`)
        const resolverModifyOne = _.camelCase(`modify_${tableName}_ById`)
        const resolverModifySelfOne = _.camelCase(`modify_self_${tableName}_ById`)
        const resolverSearch = _.camelCase(`search_${tableName}`)
        const resolverSearchSelf = _.camelCase(`search_self_${tableName}`)
        if (primaryIds.length) {
          if (self.options.autoSequelizeQuery) {
            //findOne
            text += 'const ' + resolverFindOne + ' = {\n'
            text += indent + 'type: ' + typeName + ',\n'
            text += indent + 'description: "findOneById",\n'
            text += indent + 'args: {\n'
            var sql = 'select * from ' + table + ' where 1=1'
            var paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              sql += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize }) {\n'
            text += indent + indent + 'if (!sequelize) return null\n'
            text += indent + indent + 'let list = await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.SELECT, replacements: ' + paramMap + ' })\n'
            text += indent + indent + 'return list[0]\n'
            text += indent + '}\n'
            text += '}\n\n'
            //findOne self
            text += 'const ' + resolverFindSelfOne + ' = {\n'
            text += indent + 'type: ' + typeName + ',\n'
            text += indent + 'description: "findOneById self",\n'
            text += indent + 'args: {\n'
            sql = 'select * from ' + table + ' where 1=1'
            paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              sql += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            _.each(fieldTypeMap, function(fType, field) {
              if (field === self.options.selfKey) {
                sql += ' and ' + field + '= :' + field
                paramMap += field + ':ctx.session.loginname,'
              }
            })
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return null\n'
            text += indent + indent + 'let list = await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.SELECT, replacements: ' + paramMap + ' })\n'
            text += indent + indent + 'return list[0]\n'
            text += indent + '}\n'
            text += '}\n\n'
            //findAll
            text += 'const ' + resolverFindAll + ' = {\n'
            text += indent + 'type: new GraphQLList(' + typeName + '),\n'
            text += indent + 'description: "findAll",\n'
            text += indent + 'args: {},\n'
            var sql = 'select * from ' + table + ' where enabled=1'
            text += indent + 'async resolve(obj, params, { sequelize }) {\n'
            text += indent + indent + 'if (!sequelize) return null\n'
            text += indent + indent + 'return await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.SELECT })\n'
            text += indent + '}\n'
            text += '}\n\n'
            //findAll self
            text += 'const ' + resolverFindSelfAll + ' = {\n'
            text += indent + 'type: new GraphQLList(' + typeName + '),\n'
            text += indent + 'description: "findAll self",\n'
            text += indent + 'args: {selfKey:{type:GraphQLString,description:"描述所有人的字段，默认是' + self.options.selfKey + '"}},\n'
            var sql = 'select * from ' + table + ' where enabled=1 and ' + self.options.selfKey + '=:' + self.options.selfKey
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return null\n'
            text += indent + indent + 'var sqlStr = "' + sql + '"\n'
            text += indent + indent + 'if (params.selfKey && typeof params.selfKey === "string"){\n'
            text += indent + indent + indent + 'sqlStr = sqlStr.replace("' + self.options.selfKey + '",params.selfKey)\n'
            text += indent + indent + '}\n'
            text += indent + indent + 'return await sequelize.query(sqlStr, { type: sequelize.QueryTypes.SELECT, replacements: { ' + self.options.selfKey + ': ctx.session.loginname} })\n'
            text += indent + '}\n'
            text += '}\n\n'
            //addOne
            text += 'const ' + resolverAddOne + ' = {\n'
            text += indent + 'type: GraphQLBoolean,\n'
            text += indent + 'description: "addOne",\n'
            text += indent + 'args: {\n'
            var inputParam = []
            sql = 'insert into ' + table
            paramMap = '{'
            _.each(fieldTypeMap, function(fType, field) {
              //not primary field && not common field
              if (!fieldPrimaryMap[field] && self.options.commonFields.indexOf(field) < 0) {
                if (field != self.options.selfKey){
                  text += indent + indent + field + ':{\n'
                  text += indent + indent + indent + 'name :"' + field + '",\n'
                  text += indent + indent + indent + 'type : ' + fieldTypeMap[field] + ',\n'
                  text += indent + indent + indent + 'description: "' + fieldDescriptionMap[field] + '"\n'
                  text += indent + indent + '},\n'
                }

                inputParam.push(field)
                paramMap += field + ': params.' + field + ','
              }
            })
            var valueHolder = _.map(inputParam, function(field){
              return `:${field}`
            })
            _.each(self.options.commonFields, function(field) {
              inputParam.push(field)
              valueHolder.push(`:${field}`)

              var commonValue = null
              if (field === 'created_time') {
                commonValue = 'new Date()'
              }else if (field === 'created_user') {
                commonValue = 'ctx.session.loginname'
              }else if (field === 'modified_time') {
                commonValue = null
              }else if (field === 'modified_user') {
                commonValue = null
              }else if(field === 'enabled'){
                commonValue = 1
              }
              paramMap += field + `:${commonValue},`
            })
            paramMap += '}'
            sql += '(' + inputParam.join(',') + ') values(' + valueHolder.join(',') + ')'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var res = await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.INSERT, replacements: ' + paramMap + '})\n'
            text += indent + indent + 'return (res && res.length && res[1] > 0)\n'
            text += indent + '}\n'
            text += '}\n\n'
            //modifyOne
            text += 'const ' + resolverModifyOne + ' = {\n'
            text += indent + 'type: GraphQLBoolean,\n'
            text += indent + 'description: "modifyOne",\n'
            text += indent + 'args: {\n'
            sql = 'update ' + table + ' set '
            var where = ' where 1=1 '
            var updateParams = []
            var inputParams = []
            paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              where += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            _.each(fieldTypeMap, function(fType, field) {
              //not primary field && not common field
              if (!fieldPrimaryMap[field] && self.options.commonFields.indexOf(field) < 0 && field != self.options.selfKey) {
                text += indent + indent + field + ':{\n'
                text += indent + indent + indent + 'name :"' + field + '",\n'
                text += indent + indent + indent + 'type : ' + fieldTypeMap[field] + ',\n'
                text += indent + indent + indent + 'description: "' + fieldDescriptionMap[field] + '"\n'
                text += indent + indent + '},\n'

                updateParams.push(field)
                inputParams.push(field)
                paramMap += field + ': params.' + field + ','
              }
            })
            _.each(self.options.commonFields, function(field) {
              if (field === 'modified_time') {
                updateParams.push(field)
                paramMap += field + `:new Date(),`
              } else if (field === 'modified_user') {
                updateParams.push(field)
                paramMap += field + ': ctx.session.loginname,'
              }
            })
            sql += _.map(updateParams, function(field){
              return `${field}=:${field}`
            }).join(',')
            sql += where
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var inputParams = ' + JSON.stringify(inputParams) + '\n'
            text += indent + indent + 'var sqlStr = "' + sql + '"\n'
            text += indent + indent + 'inputParams.map(function(field){' + '\n'
            text += indent + indent + indent + 'if (typeof params[field] === "undefined"){' + '\n'
            text += indent + indent + indent + indent + 'sqlStr = sqlStr.replace(field + "=:" + field + ",","")' + '\n'
            text += indent + indent + indent + '}' + '\n'
            text += indent + indent + '})\n'
            text += indent + indent + 'var res = await sequelize.query(sqlStr, { type: sequelize.QueryTypes.UPDATE, replacements: ' + paramMap + '})\n'
            text += indent + indent + 'return (res && res.length && res[1] > 0)\n'
            text += indent + '}\n'
            text += '}\n\n'
            //mofifyOne self
            text += 'const ' + resolverModifySelfOne + ' = {\n'
            text += indent + 'type: GraphQLBoolean,\n'
            text += indent + 'description: "modifyOne self",\n'
            text += indent + 'args: {\n'
            sql = 'update ' + table + ' set '
            where = ' where 1=1 '
            updateParams = []
            inputParams = []
            paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              where += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            _.each(fieldTypeMap, function(fType, field) {
              //not primary field && not common field
              if (!fieldPrimaryMap[field] && self.options.commonFields.indexOf(field) < 0 && field != self.options.selfKey) {
                text += indent + indent + field + ':{\n'
                text += indent + indent + indent + 'name :"' + field + '",\n'
                text += indent + indent + indent + 'type : ' + fieldTypeMap[field] + ',\n'
                text += indent + indent + indent + 'description: "' + fieldDescriptionMap[field] + '"\n'
                text += indent + indent + '},\n'

                updateParams.push(field)
                inputParams.push(field)
                paramMap += field + ': params.' + field + ','
              }

              if (field == self.options.selfKey) {
                where += ' and ' + field + '= :' + field
                paramMap += field + ': ctx.session.loginname' + ','
              }
            })
            _.each(self.options.commonFields, function(field) {
              if (field === 'modified_time') {
                updateParams.push(field)
                paramMap += field + `:new Date(),`
              } else if (field === 'modified_user') {
                updateParams.push(field)
                paramMap += field + ': ctx.session.loginname,'
              }
            })
            sql += _.map(updateParams, function(field){
              return `${field}=:${field}`
            }).join(',')
            sql += where
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var inputParams = ' + JSON.stringify(inputParams) + '\n'
            text += indent + indent + 'var sqlStr = "' + sql + '"\n'
            text += indent + indent + 'inputParams.map(function(field){' + '\n'
            text += indent + indent + indent + 'if (typeof params[field] === "undefined"){' + '\n'
            text += indent + indent + indent + indent + 'sqlStr = sqlStr.replace(field + "=:" + field + ",","")' + '\n'
            text += indent + indent + indent + '}' + '\n'
            text += indent + indent + '})\n'
            text += indent + indent + 'var res = await sequelize.query(sqlStr, { type: sequelize.QueryTypes.UPDATE, replacements: ' + paramMap + '})\n'
            text += indent + indent + 'return (res && res.length && res[1] > 0)\n'
            text += indent + '}\n'
            text += '}\n\n'
            //deleteOne
            text += 'const ' + resolverDeleteOne + ' = {\n'
            text += indent + 'type: GraphQLBoolean,\n'
            text += indent + 'description: "deleteOne",\n'
            text += indent + 'args: {\n'
            sql = 'delete from ' + table + ' where 1=1 '
            paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              sql += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var res = await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.UPDATE, replacements: ' + paramMap + '})\n'
            text += indent + indent + 'return (res && res.length && res[1] > 0)\n'
            text += indent + '}\n'
            text += '}\n\n'
            //deleteOne self
            text += 'const ' + resolverDeleteSelfOne + ' = {\n'
            text += indent + 'type: GraphQLBoolean,\n'
            text += indent + 'description: "deleteOne self",\n'
            text += indent + 'args: {\n'
            sql = 'delete from ' + table + ' where 1=1 '
            paramMap = '{'
            _.each(primaryIds, function(id){
              text += indent + indent + id.key + ':{\n'
              text += indent + indent + indent + 'name :"' + id.key + '",\n'
              text += indent + indent + indent + 'type : new GraphQLNonNull(GraphQLID),\n'
              text += indent + indent + indent + 'description: "' + id.value + '"\n'
              text += indent + indent + '},\n'

              sql += ' and ' + id.key + '= :' + id.key
              paramMap += id.key + ': params.' + id.key + ','
            })
            _.each(fieldTypeMap, function(fType, field) {
              if (field === self.options.selfKey) {
                sql += ' and ' + field + '= :' + field
                paramMap += field + ': ctx.session.loginname,'
              }
            })
            paramMap += '}'
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var res = await sequelize.query("' + sql + '", { type: sequelize.QueryTypes.UPDATE, replacements: ' + paramMap + '})\n'
            text += indent + indent + 'return (res && res.length && res[1] > 0)\n'
            text += indent + '}\n'
            text += '}\n\n'
            //search
            text += 'const ' + resolverSearch + ' = {\n'
            text += indent + 'type: new GraphQLList(' + typeName + '),\n'
            text += indent + 'description: "search",\n'
            text += indent + 'args: {\n'
            sql = 'select * from ' + table + ' where 1=1 and enabled=1'
            inputParams = []
            _.each(fieldTypeMap, function(fType, field) {
              text += indent + indent + field + ':{\n'
              text += indent + indent + indent + 'name :"' + field + '",\n'
              text += indent + indent + indent + 'type : GraphQLString,\n'
              text += indent + indent + indent + 'description: "' + fieldDescriptionMap[field] + '"\n'
              text += indent + indent + '},\n'

              inputParams.push(field)
            })
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var inputParams = ' + JSON.stringify(inputParams) + '\n'
            text += indent + indent + 'var sqlStr = "' + sql + '"\n'
            text += indent + indent + 'var paramMap = {}\n'
            text += indent + indent + 'inputParams.map(function(field){' + '\n'
            text += indent + indent + indent + 'var arr = parseValue(params[field])' + '\n'
            text += indent + indent + indent + 'if (arr !== false){' + '\n'
            text += indent + indent + indent + indent + 'paramMap[field]= arr[1]' + '\n'
            text += indent + indent + indent + indent + 'sqlStr += " and " + field + " " + arr[0] + " :" + field' + '\n'
            text += indent + indent + indent + '}' + '\n'
            text += indent + indent + '})\n'
            text += indent + indent + 'var res = await sequelize.query(sqlStr, { type: sequelize.QueryTypes.SELECT, replacements: paramMap})\n'
            text += indent + indent + 'return res\n'
            text += indent + '}\n'
            text += '}\n\n'
            //search self
            text += 'const ' + resolverSearchSelf + ' = {\n'
            text += indent + 'type: new GraphQLList(' + typeName + '),\n'
            text += indent + 'description: "search",\n'
            text += indent + 'args: {\n'
            sql = 'select * from ' + table + ' where 1=1 and enabled=1 and '
            inputParams = []
            _.each(fieldTypeMap, function(fType, field) {
              if (field != self.options.selfKey){
                text += indent + indent + field + ':{\n'
                text += indent + indent + indent + 'name :"' + field + '",\n'
                text += indent + indent + indent + 'type : GraphQLString,\n'
                text += indent + indent + indent + 'description: "' + fieldDescriptionMap[field] + '"\n'
                text += indent + indent + '},\n'

                inputParams.push(field)
              } else {
                sql += ' ' + field + "= :" + field
              }
            })
            text += indent + '},\n'
            text += indent + 'async resolve(obj, params, { sequelize, ctx }) {\n'
            text += indent + indent + 'if (!sequelize) return false\n'
            text += indent + indent + 'var inputParams = ' + JSON.stringify(inputParams) + '\n'
            text += indent + indent + 'var sqlStr = "' + sql + '"\n'
            text += indent + indent + 'var paramMap = {}\n'
            text += indent + indent + 'paramMap["' + self.options.selfKey + '"] = ctx.session.loginname\n'
            text += indent + indent + 'inputParams.map(function(field){' + '\n'
            text += indent + indent + indent + 'var arr = parseValue(params[field])' + '\n'
            text += indent + indent + indent + 'if (arr !== false){' + '\n'
            text += indent + indent + indent + indent + 'paramMap[field]= arr[1]' + '\n'
            text += indent + indent + indent + indent + 'sqlStr += " and " + field + " " + arr[0] + " :" + field' + '\n'
            text += indent + indent + indent + '}' + '\n'
            text += indent + indent + '})\n'
            text += indent + indent + 'console.log(paramMap)\n'
            text += indent + indent + 'var res = await sequelize.query(sqlStr, { type: sequelize.QueryTypes.SELECT, replacements: paramMap})\n'
            text += indent + indent + 'return res\n'
            text += indent + '}\n'
            text += '}\n\n'
          }
        }
        text += 'module.exports = {\n'
        text += indent + 'originalName: originalName,\n'
        text += indent + 'name: name,\n'
        text += indent + 'type:' + typeName + ',\n'
        if (primaryIds.length && self.options.autoSequelizeQuery) {
          if (!isView) {
            text += indent + 'query: {' + resolverFindOne + ',' + resolverFindSelfOne + ',' + resolverFindAll + ',' + resolverFindSelfAll + ',' + resolverSearch + ',' + resolverSearchSelf + '},\n'
            text += indent + 'mutation: {' + resolverAddOne + ',' + resolverModifyOne + ',' + resolverModifySelfOne + ',' + resolverDeleteOne + ',' + resolverDeleteSelfOne + '},\n'
          } else {
            text += indent + 'query: {' + resolverSearch + ',' + resolverSearchSelf + '},\n'
            text += indent + 'mutation: {},\n'
          }
        }
        text += '}\n'
        res[table] = text;
      })
      self.sequelize.close();
      if (self.options.outpath) {
        return self.write(res, callback)
      }
      callback(false, res)
    })
  }
}

AutoSchema.prototype.write = function(data, callback) {
  var tables = _.keys(data)
  var self = this

  mkdirp.sync(path.resolve(self.options.outpath));

  asyncUtil.each(tables, outputFile, callback)

  function outputFile(table, _callback) {
    var fileName = self.options.camelCaseForFileName ? _.camelCase(table) : table;
    fs.writeFile(path.resolve(path.join(self.options.outpath, fileName + '.js')), data[table], _callback);
  }
}


function main() {
  // mysql配置
  const dbConfig = {
    "username": "帐号",
    "password": "密码",
    "database": "数据库名称",
    "host": "服务器ip",
    "dialect": "mysql"
  }
  const path = require('path')
  const appPath = path.resolve(__dirname, '..')
  // 生成的schema文件存放的位置
  const outpath = path.resolve(appPath, 'graphql/auto/')

  const auto = new AutoSchema(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    outpath: outpath,
    formatTableName: function(tableName) {
      let res = tableName
      if (res.indexOf('t_') === 0 || res.indexOf('v_') === 0) {
        res = res.slice(2)
      }
      return _.camelCase(res)
    }
  })
  auto.run(function(err, res) {
    console.log("run", err, res)
  })
}

main()