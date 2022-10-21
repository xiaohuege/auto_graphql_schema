const {GraphQLObjectType,GraphQLString,GraphQLID,GraphQLList,GraphQLNonNull,GraphQLInt,GraphQLFloat,GraphQLBoolean} = require("graphql")

const originalName = "t_user"

const name = "userType"

const userType = new GraphQLObjectType({
	name:"User",
	fields:{
		id: {
			type: GraphQLID,
			description: "",
		},
		username: {
			type: GraphQLString,
			description: "",
		},
		mobile: {
			type: GraphQLString,
			description: "",
		},
		age: {
			type: GraphQLInt,
			description: "",
		},
		email: {
			type: GraphQLString,
			description: "",
		},
		address: {
			type: GraphQLString,
			description: "",
		},
		enabled: {
			type: GraphQLInt,
			description: "",
		},
		created_time: {
			type: GraphQLString,
			description: "",
		},
		modified_time: {
			type: GraphQLString,
			description: "",
		},
		created_user: {
			type: GraphQLString,
			description: "",
		},
		modified_user: {
			type: GraphQLString,
			description: "",
		},
	}
})

const getUserById = {
	type: userType,
	description: "findOneById",
	args: {
		id:{
			name :"id",
			type : new GraphQLNonNull(GraphQLID),
			description: ""
		},
	},
	async resolve(obj, params, { sequelize }) {
		if (!sequelize) return null
		let list = await sequelize.query("select * from t_user where 1=1 and id= :id", { type: sequelize.QueryTypes.SELECT, replacements: {id: params.id,} })
		return list[0]
	}
}

const getUserList = {
	type: new GraphQLList(userType),
	description: "findAll",
	args: {},
	async resolve(obj, params, { sequelize }) {
		if (!sequelize) return null
		return await sequelize.query("select * from t_user", { type: sequelize.QueryTypes.SELECT })
	}
}

const getSelfUserList = {
	type: new GraphQLList(userType),
	description: "findAll self",
	args: {selfKey:{type:GraphQLString,description:"描述所有人的字段，默认是created_user"}},
	async resolve(obj, params, { sequelize, ctx }) {
		if (!sequelize) return null
		var sqlStr = "select * from t_user where created_user=:created_user"
		if (params.selfKey && typeof params.selfKey === "string"){
			sqlStr = sqlStr.replace("created_user",params.selfKey)
		}
		return await sequelize.query(sqlStr, { type: sequelize.QueryTypes.SELECT, replacements: { created_user: ctx.session.loginname || "nologin"} })
	}
}

const addUser = {
	type: GraphQLBoolean,
	description: "addOne",
	args: {
		username:{
			name :"username",
			type : GraphQLString,
			description: ""
		},
		mobile:{
			name :"mobile",
			type : GraphQLString,
			description: ""
		},
		age:{
			name :"age",
			type : GraphQLInt,
			description: ""
		},
		email:{
			name :"email",
			type : GraphQLString,
			description: ""
		},
		address:{
			name :"address",
			type : GraphQLString,
			description: ""
		},
		enabled:{
			name :"enabled",
			type : GraphQLInt,
			description: ""
		},
	},
	async resolve(obj, params, { sequelize, ctx }) {
		if (!sequelize) return false
		var res = await sequelize.query("insert into t_user(username,mobile,age,email,address,enabled,created_user,created_time,modified_user,modified_time) values(:username,:mobile,:age,:email,:address,:enabled,:created_user,:created_time,:modified_user,:modified_time)", { type: sequelize.QueryTypes.INSERT, replacements: {username: params.username,mobile: params.mobile,age: params.age,email: params.email,address: params.address,enabled: params.enabled,created_user:ctx.session.loginname || 'nologin',created_time:new Date(),modified_user:null,modified_time:null,}})
		return (res && res.length && res[1] > 0)
	}
}

const modifyUserById = {
	type: GraphQLBoolean,
	description: "modifyOne",
	args: {
		id:{
			name :"id",
			type : new GraphQLNonNull(GraphQLID),
			description: ""
		},
		username:{
			name :"username",
			type : GraphQLString,
			description: ""
		},
		mobile:{
			name :"mobile",
			type : GraphQLString,
			description: ""
		},
		age:{
			name :"age",
			type : GraphQLInt,
			description: ""
		},
		email:{
			name :"email",
			type : GraphQLString,
			description: ""
		},
		address:{
			name :"address",
			type : GraphQLString,
			description: ""
		},
		enabled:{
			name :"enabled",
			type : GraphQLInt,
			description: ""
		},
	},
	async resolve(obj, params, { sequelize, ctx }) {
		if (!sequelize) return false
		var inputParams = ["username","mobile","age","email","address","enabled"]
		var sqlStr = "update t_user set username=:username,mobile=:mobile,age=:age,email=:email,address=:address,enabled=:enabled,modified_user=:modified_user,modified_time=:modified_time where 1=1  and id= :id"
		inputParams.map(function(field){
			if (typeof params[field] === "undefined"){
				sqlStr = sqlStr.replace(field + "=:" + field + ",","")
			}
		})
		var res = await sequelize.query(sqlStr, { type: sequelize.QueryTypes.UPDATE, replacements: {id: params.id,username: params.username,mobile: params.mobile,age: params.age,email: params.email,address: params.address,enabled: params.enabled,modified_user:ctx.session.loginname || 'nologin',modified_time:new Date(),}})
		return (res && res.length && res[1] > 0)
	}
}

const deleteUserById = {
	type: GraphQLBoolean,
	description: "deleteOne",
	args: {
		id:{
			name :"id",
			type : new GraphQLNonNull(GraphQLID),
			description: ""
		},
	},
	async resolve(obj, params, { sequelize, ctx }) {
		if (!sequelize) return false
		var res = await sequelize.query("delete from t_user where 1=1  and id= :id", { type: sequelize.QueryTypes.UPDATE, replacements: {id: params.id,}})
		return (res && res.length && res[1] > 0)
	}
}

module.exports = {
	originalName: originalName,
	name: name,
	type:userType,
	query: {getUserById,getUserList,getSelfUserList},
	mutation: {addUser,modifyUserById,deleteUserById},
}
