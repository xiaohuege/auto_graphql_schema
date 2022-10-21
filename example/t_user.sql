CREATE TABLE `t_user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT 'rtx',
  `chnname` varchar(50) NOT NULL COMMENT '中文名',
  `sign_img` text,
  `is_admin` int(11) NOT NULL DEFAULT '0' COMMENT '是否是管理员',
  `enabled` int(11) NOT NULL DEFAULT '1',
  `created_user` varchar(50) NOT NULL,
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_user` varchar(50) DEFAULT NULL,
  `modified_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8